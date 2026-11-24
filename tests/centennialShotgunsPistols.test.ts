import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  CENTENNIAL_66_IDS,
  isCentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';
import { SHOTGUNS_AND_PISTOLS_BLUEPRINTS } from '../src/weapons/expansion/catalog/shotgunsAndPistols';

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

describe('100-Weapon Expansion Phase 2B — Shotguns & Pistols Catalog (BAY-75..BAY-90)', () => {
  it('validates all 16 Shotgun & Pistol blueprints in canonical CENTENNIAL_66_IDS order with pure leaf imports, 0 EN CJK & 0 WP-XX', () => {
    expect(SHOTGUNS_AND_PISTOLS_BLUEPRINTS).toHaveLength(16);

    // Exact match against CENTENNIAL_66_IDS slice [40..56) (BAY-75..BAY-90)
    const expectedSlice = CENTENNIAL_66_IDS.slice(40, 56);
    expect(SHOTGUNS_AND_PISTOLS_BLUEPRINTS.map((b) => b.id)).toEqual([
      ...expectedSlice,
    ]);

    // Pure leaf import check (ONLY `import type` allowed)
    const catalogSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/weapons/expansion/catalog/shotgunsAndPistols.ts'
      ),
      'utf8'
    );
    expect(/^import\s+(?!type\b)/m.test(catalogSrc)).toBe(false);

    const liveGlossaryIds = new Set(ENGINEERING_GLOSSARY_TERMS.map((t) => t.id));
    const categoryCounts: Record<string, number> = {};

    SHOTGUNS_AND_PISTOLS_BLUEPRINTS.forEach((bp, idx) => {
      const expectedOrder = 75 + idx;
      expect(bp.orderIndex).toBe(expectedOrder);
      expect(bp.bayCode).toBe(`BAY-${expectedOrder}`);
      expect(isCentennialWeaponId(bp.id)).toBe(true);

      categoryCounts[bp.category] = (categoryCounts[bp.category] ?? 0) + 1;
      if (bp.category === 'pistol') {
        expect(bp.scaleProfile).toBe('pistol');
      } else {
        expect(bp.category).toBe('shotgun');
        expect(bp.scaleProfile).toBe('rifle');
      }

      // Authentic 1:1 metrology
      expect(bp.year).toBeGreaterThanOrEqual(1873);
      expect(bp.year).toBeLessThanOrEqual(2026);
      expect(bp.overallLengthMm).toBeGreaterThan(140);
      expect(bp.barrelLengthMm).toBeGreaterThan(75);
      expect(bp.emptyWeightKg).toBeGreaterThan(0.5);
      expect(bp.muzzleVelocityMs).toBeGreaterThan(200);
      expect(bp.effectiveRangeM).toBeGreaterThanOrEqual(25);
      expect(bp.rateOfFireRpm).toBeGreaterThan(0);
      expect(bp.peakPressureMpa).toBeGreaterThan(50);
      expect(bp.magCapacity).toBeGreaterThanOrEqual(3);
      expect(bp.boreAxisMm).toBeGreaterThan(15);
      expect(bp.recoilImpulseNs).toBeGreaterThan(1);
      expect(bp.muzzleEnergyJ).toBeGreaterThan(200);

      // Positive CAD dimensions
      expect(bp.cad.barrelLenCm).toBeGreaterThan(0);
      expect(bp.cad.receiverLenCm).toBeGreaterThan(0);
      expect(bp.cad.receiverHeightCm).toBeGreaterThan(0);
      expect(bp.cad.stockLenCm).toBeGreaterThan(0);
      expect(bp.cad.handguardLenCm).toBeGreaterThan(0);

      // Highlights & valid glossary terms (>= 2 unique)
      expect(bp.highlightsZh).toHaveLength(4);
      expect(bp.highlightsEn).toHaveLength(4);
      expect(bp.glossaryTermIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(bp.glossaryTermIds).size).toBe(bp.glossaryTermIds.length);
      for (const termId of bp.glossaryTermIds) {
        expect(liveGlossaryIds.has(termId)).toBe(true);
      }

      // Strict 0 EN CJK & 0 WP-XX across every bilingual field
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
        expect(CJK_RE.test(field)).toBe(false);
        expect(WP_JARGON_RE.test(field)).toBe(false);
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
        expect(WP_JARGON_RE.test(field)).toBe(false);
      }
    });

    // Exact hall distribution: 6 shotguns, 10 pistols
    expect(categoryCounts).toEqual({
      shotgun: 6,
      pistol: 10,
    });

    // Spot-check signature technical invariants from #368
    const byId = Object.fromEntries(
      SHOTGUNS_AND_PISTOLS_BLUEPRINTS.map((b) => [b.id, b])
    );
    expect(byId.ks23.rifling.profile).toBe('conventional');
    expect(byId.ks23.cad.hasWoodFurniture).toBe(true);
    expect(byId.spas12.cad.muzzleStyle).toBe('shroud');
    expect(byId.aa12.cad.magStyle).toBe('drum');
    expect(byId.winchester1887.kinematicLaw).toBe('lever_action');
    expect(byId.usp45.cad.muzzleStyle).toBe('suppressor');
    expect(byId.c96.cad.magStyle).toBe('box_internal');
    expect(byId.fiveseven.kinematicLaw).toBe('lever_delayed');
    expect(byId.saa1873.archetype).toBe('revolver_sa');
    expect(byId.sw500.cad.muzzleStyle).toBe('brake');
  });
});

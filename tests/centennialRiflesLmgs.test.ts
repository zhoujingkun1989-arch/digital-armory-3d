import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  CENTENNIAL_66_IDS,
  isCentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';
import { RIFLES_AND_LMGS_BLUEPRINTS } from '../src/weapons/expansion/catalog/riflesAndLmgs';

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

describe('100-Weapon Expansion Phase 2C — Rifles & LMGs Catalog (BAY-35..BAY-56)', () => {
  it('enforces pure-leaf import hygiene (type-only imports, zero runtime imports) and canonical BAY-35..BAY-56 ordering', () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/weapons/expansion/catalog/riflesAndLmgs.ts'
      ),
      'utf8'
    );
    const runtimeImportRe = /^import\s+(?!type\b)/m;
    expect(runtimeImportRe.test(src)).toBe(false);

    expect(RIFLES_AND_LMGS_BLUEPRINTS).toHaveLength(22);

    const expectedIds = CENTENNIAL_66_IDS.slice(0, 22);
    expect(RIFLES_AND_LMGS_BLUEPRINTS.map((b) => b.id)).toEqual([
      ...expectedIds,
    ]);
  });

  it('validates all 22 Assault/Battle Rifle & LMG blueprints for accurate 1:1 metrology, CAD spec, glossary parity, 0 EN CJK & 0 WP-XX', () => {
    const liveGlossaryIds = new Set(
      ENGINEERING_GLOSSARY_TERMS.map((t) => t.id)
    );
    const categoryCounts: Record<string, number> = {};

    RIFLES_AND_LMGS_BLUEPRINTS.forEach((bp, idx) => {
      const expectedOrder = 35 + idx;
      expect(bp.orderIndex).toBe(expectedOrder);
      expect(bp.bayCode).toBe(`BAY-${expectedOrder}`);
      expect(isCentennialWeaponId(bp.id)).toBe(true);

      categoryCounts[bp.category] = (categoryCounts[bp.category] ?? 0) + 1;

      if (bp.id === 'm2hb') {
        expect(bp.scaleProfile).toBe('heavy_sniper');
      } else {
        expect(bp.scaleProfile).toBe('rifle');
      }

      // Authentic positive finite 1:1 metrology
      expect(bp.year).toBeGreaterThanOrEqual(1918);
      expect(bp.year).toBeLessThanOrEqual(2026);
      expect(bp.overallLengthMm).toBeGreaterThanOrEqual(700);
      expect(bp.overallLengthMm).toBeLessThanOrEqual(1700);
      expect(bp.barrelLengthMm).toBeGreaterThanOrEqual(220);
      expect(bp.barrelLengthMm).toBeLessThan(bp.overallLengthMm);
      expect(bp.emptyWeightKg).toBeGreaterThanOrEqual(2.5);
      expect(bp.emptyWeightKg).toBeLessThanOrEqual(40);
      expect(bp.muzzleVelocityMs).toBeGreaterThanOrEqual(650);
      expect(bp.muzzleVelocityMs).toBeLessThanOrEqual(1050);
      expect(bp.effectiveRangeM).toBeGreaterThanOrEqual(300);
      expect(bp.rateOfFireRpm).toBeGreaterThanOrEqual(35);
      expect(bp.peakPressureMpa).toBeGreaterThanOrEqual(300);
      expect(bp.magCapacity).toBeGreaterThanOrEqual(10);
      expect(bp.boreAxisMm).toBeGreaterThanOrEqual(25);
      expect(bp.recoilImpulseNs).toBeGreaterThan(4);
      expect(bp.muzzleEnergyJ).toBeGreaterThanOrEqual(1000);

      // Bore & rifling metrology
      expect(bp.rifling.profile).toBe('conventional');
      expect(bp.rifling.grooveCount).toBeGreaterThanOrEqual(3);
      expect(bp.rifling.twistMm).toBeGreaterThanOrEqual(170);
      expect(bp.rifling.twistDirection).toBe('RH');
      expect(bp.rifling.boreDiameterMm).toBeGreaterThanOrEqual(5.4);
      expect(bp.rifling.boreDiameterMm).toBeLessThanOrEqual(12.8);

      // Positive finite CAD visual proportions
      expect(bp.cad.barrelLenCm).toBeGreaterThan(20);
      expect(bp.cad.receiverLenCm).toBeGreaterThan(20);
      expect(bp.cad.receiverHeightCm).toBeGreaterThan(6);
      expect(bp.cad.stockLenCm).toBeGreaterThan(14);
      expect(bp.cad.handguardLenCm).toBeGreaterThan(14);

      // Highlights & valid unique glossary IDs (>= 2)
      expect(bp.highlightsZh).toHaveLength(4);
      expect(bp.highlightsEn).toHaveLength(4);
      expect(bp.glossaryTermIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(bp.glossaryTermIds).size).toBe(bp.glossaryTermIds.length);
      for (const termId of bp.glossaryTermIds) {
        expect(liveGlossaryIds.has(termId)).toBe(true);
      }

      // Strict 0 EN CJK & 0 WP-XX public leakage
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
        expect(CJK_RE.test(field), `CJK leak in EN (${bp.id}): ${field}`).toBe(
          false
        );
        expect(
          WP_JARGON_RE.test(field),
          `WP leak in EN (${bp.id}): ${field}`
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
          `WP leak in ZH (${bp.id}): ${field}`
        ).toBe(false);
      }
    });

    // Exact hall counts: 15 Assault/Battle Rifles + 7 Machine Guns/LMGs
    expect(categoryCounts).toEqual({
      rifle: 15,
      lmg: 7,
    });
  });
});

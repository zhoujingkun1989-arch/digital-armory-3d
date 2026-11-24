import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  CENTENNIAL_66_IDS,
  isCentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';
import { SMGS_AND_SNIPERS_BLUEPRINTS } from '../src/weapons/expansion/catalog/smgsAndSnipers';

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

const EXPECTED_IDS = [
  // SMGs (BAY-57..65)
  'uzi',
  'mp40',
  'ppsh41',
  'mp7',
  'ump45',
  'mac10',
  'sten',
  'scorpion',
  'bizon',
  // Snipers (BAY-66..74)
  'svd',
  'mosin',
  'leeenfield',
  'm24',
  'm200',
  'wa2000',
  'mk14ebr',
  'sr25',
  'springfield1903',
] as const;

describe('100-Weapon Expansion Phase 2A — SMGs & Snipers Blueprint Catalog (BAY-57..BAY-74)', () => {
  it('enforces pure-leaf import hygiene (import type ONLY, zero runtime imports)', () => {
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/weapons/expansion/catalog/smgsAndSnipers.ts'
      ),
      'utf8'
    );
    const runtimeImportRe = /^import\s+(?!type\b)/m;
    expect(runtimeImportRe.test(src)).toBe(false);
  });

  it('validates all 18 BAY-57..BAY-74 blueprints in canonical order with 0 EN CJK, 0 WP-XX & realistic 1:1 metrology', () => {
    expect(SMGS_AND_SNIPERS_BLUEPRINTS).toHaveLength(18);
    expect(SMGS_AND_SNIPERS_BLUEPRINTS.map((b) => b.id)).toEqual([
      ...EXPECTED_IDS,
    ]);

    // Exact alignment with CENTENNIAL_66_IDS slice [22..40) (BAY-57..74)
    expect(CENTENNIAL_66_IDS.slice(22, 40)).toEqual([...EXPECTED_IDS]);

    const liveGlossaryIds = new Set(ENGINEERING_GLOSSARY_TERMS.map((t) => t.id));
    const categoryCounts: Record<string, number> = {};

    SMGS_AND_SNIPERS_BLUEPRINTS.forEach((bp, idx) => {
      const expectedOrder = 57 + idx;
      expect(bp.orderIndex).toBe(expectedOrder);
      expect(bp.bayCode).toBe(`BAY-${expectedOrder}`);
      expect(isCentennialWeaponId(bp.id)).toBe(true);

      categoryCounts[bp.category] = (categoryCounts[bp.category] ?? 0) + 1;

      // Positive finite 1:1 metrology
      expect(bp.year).toBeGreaterThanOrEqual(1891);
      expect(bp.year).toBeLessThanOrEqual(2026);
      expect(bp.overallLengthMm).toBeGreaterThan(400);
      expect(bp.overallLengthMm).toBeLessThan(1600);
      expect(bp.barrelLengthMm).toBeGreaterThan(120);
      expect(bp.barrelLengthMm).toBeLessThan(bp.overallLengthMm);
      expect(bp.emptyWeightKg).toBeGreaterThan(1.5);
      expect(bp.emptyWeightKg).toBeLessThan(16);
      expect(bp.muzzleVelocityMs).toBeGreaterThan(250);
      expect(bp.effectiveRangeM).toBeGreaterThanOrEqual(70);
      expect(bp.rateOfFireRpm).toBeGreaterThanOrEqual(10);
      expect(bp.peakPressureMpa).toBeGreaterThan(100);
      expect(bp.magCapacity).toBeGreaterThanOrEqual(5);
      expect(bp.boreAxisMm).toBeGreaterThan(10);
      expect(bp.recoilImpulseNs).toBeGreaterThan(1.5);
      expect(bp.muzzleEnergyJ).toBeGreaterThan(300);

      // Valid rifling parameters
      expect(bp.rifling.grooveCount).toBeGreaterThanOrEqual(4);
      expect(bp.rifling.twistMm).toBeGreaterThan(120);
      expect(bp.rifling.boreDiameterMm).toBeGreaterThan(4);
      expect(['RH', 'LH']).toContain(bp.rifling.twistDirection);

      // Positive finite CAD proportions
      expect(bp.cad.barrelLenCm).toBeGreaterThan(0);
      expect(bp.cad.receiverLenCm).toBeGreaterThan(0);
      expect(bp.cad.receiverHeightCm).toBeGreaterThan(0);
      expect(bp.cad.stockLenCm).toBeGreaterThan(0);
      expect(bp.cad.handguardLenCm).toBeGreaterThan(0);

      // Highlights & valid glossary references (>= 2 unique IDs)
      expect(bp.highlightsZh).toHaveLength(4);
      expect(bp.highlightsEn).toHaveLength(4);
      expect(bp.glossaryTermIds.length).toBeGreaterThanOrEqual(2);
      expect(new Set(bp.glossaryTermIds).size).toBe(bp.glossaryTermIds.length);
      for (const termId of bp.glossaryTermIds) {
        expect(liveGlossaryIds.has(termId)).toBe(true);
      }

      // Strict 0 EN CJK & 0 WP-XX public leakage across every EN & ZH field
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

    // Exact hall distribution: 9 smg + 9 sniper
    expect(categoryCounts).toEqual({
      smg: 9,
      sniper: 9,
    });

    // Spot-check signature historical engineering traits
    const byId = Object.fromEntries(
      SMGS_AND_SNIPERS_BLUEPRINTS.map((b) => [b.id, b])
    );
    expect(byId.ppsh41.magCapacity).toBe(71);
    expect(byId.ppsh41.cad.magStyle).toBe('drum');
    expect(byId.ppsh41.cad.hasWoodFurniture).toBe(true);
    expect(byId.ppsh41.cad.muzzleStyle).toBe('shroud');
    expect(byId.mp7.kinematicLaw).toBe('short_stroke_piston');
    expect(byId.ump45.rifling.profile).toBe('polygonal');
    expect(byId.mac10.cad.muzzleStyle).toBe('suppressor');
    expect(byId.bizon.magCapacity).toBe(64);
    expect(byId.leeenfield.rifling.twistDirection).toBe('LH');
    expect(byId.m24.rifling.grooveCount).toBe(5);
    expect(byId.m200.scaleProfile).toBe('heavy_sniper');
    expect(byId.m200.cad.hasCarryHandle).toBe(true);
    expect(byId.m200.cad.muzzleStyle).toBe('brake');
    expect(byId.wa2000.archetype).toBe('sniper_bullpup');
    expect(byId.sr25.kinematicLaw).toBe('direct_impingement');
    expect(byId.sr25.cad.muzzleStyle).toBe('suppressor');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from '../src/weapons/types';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  ALL_100_WEAPON_IDS,
  CENTENNIAL_66_IDS,
  CENTENNIAL_GLOSSARY_TERM_IDS,
  FLAGSHIP_34_IDS,
  isCentennialWeaponId,
  isFlagshipWeaponId,
  mapCentennialMechanismFilterToArmoryBucket,
} from '../src/weapons/expansion/centennialTypes';
import { ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS } from '../src/weapons/expansion/catalog/archeryArmorOrdnance';

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

describe('100-Weapon Expansion Phase 1A — Centennial Types & Archery/Armor/Ordnance Catalog Foundation', () => {
  it('defines exact disjoint 34 flagship + 66 centennial IDs summing to 100 with zero circular runtime imports', () => {
    expect(FLAGSHIP_34_IDS).toHaveLength(34);
    expect(CENTENNIAL_66_IDS).toHaveLength(66);
    expect(ALL_100_WEAPON_IDS).toHaveLength(100);

    // ALL_100_WEAPON_IDS mirrors WEAPON_IDS 1:1 in exact order (34 Flagships + 66 Centennial)
    expect([...ALL_100_WEAPON_IDS]).toEqual([...WEAPON_IDS]);
    expect([...FLAGSHIP_34_IDS]).toEqual([...WEAPON_IDS.slice(0, 34)]);

    // Disjoint uniqueness check -> exact 100 unique exhibit IDs
    const flagshipSet = new Set<string>(FLAGSHIP_34_IDS);
    const centennialSet = new Set<string>(CENTENNIAL_66_IDS);
    const allSet = new Set<string>(ALL_100_WEAPON_IDS);
    expect(flagshipSet.size).toBe(34);
    expect(centennialSet.size).toBe(66);
    expect(allSet.size).toBe(100);

    for (const id of CENTENNIAL_66_IDS) {
      expect(flagshipSet.has(id)).toBe(false);
      expect(isCentennialWeaponId(id)).toBe(true);
      expect(isFlagshipWeaponId(id)).toBe(false);
    }
    for (const id of FLAGSHIP_34_IDS) {
      expect(isFlagshipWeaponId(id)).toBe(true);
      expect(isCentennialWeaponId(id)).toBe(false);
    }
    expect(isCentennialWeaponId(null)).toBe(false);
    expect(isFlagshipWeaponId('unknown_weapon')).toBe(false);

    // Verify all 28 glossary term IDs in centennialTypes match real engineeringGlossary IDs 100%
    const liveGlossaryIds = new Set(ENGINEERING_GLOSSARY_TERMS.map((t) => t.id));
    expect(CENTENNIAL_GLOSSARY_TERM_IDS.length).toBe(liveGlossaryIds.size);
    for (const termId of CENTENNIAL_GLOSSARY_TERM_IDS) {
      expect(liveGlossaryIds.has(termId)).toBe(true);
    }

    // Verify pure-leaf import hygiene (ONLY `import type` allowed in centennialTypes.ts)
    const typesSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/weapons/expansion/centennialTypes.ts'),
      'utf8'
    );
    const runtimeImportRe = /^import\s+(?!type\b)/m;
    expect(runtimeImportRe.test(typesSrc)).toBe(false);

    // Verify mechanism filter projection maps cleanly across all 8 centennial filters
    expect(mapCentennialMechanismFilterToArmoryBucket('gas_piston')).toBe(
      'rotating_bolt'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('direct_impingement')).toBe(
      'rotating_bolt'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('blowback_delayed')).toBe(
      'roller_delay'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('short_recoil')).toBe(
      'short_recoil'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('manual_action')).toBe(
      'manual_action'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('rotary_heavy')).toBe(
      'rotary_cannon'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('compound_archery')).toBe(
      'compound_archery'
    );
    expect(mapCentennialMechanismFilterToArmoryBucket('heavy_armor')).toBe(
      'smoothbore_armor'
    );
  });

  it('validates all 10 BAY-91..BAY-100 Archery, 1:1 MBT Armor & Heavy Ordnance blueprints with 0 EN CJK, 0 WP-XX & valid metrology', () => {
    expect(ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS).toHaveLength(10);

    const expectedIds = [
      'hoytrx8',
      'excalibur',
      'englishlongbow',
      't90m',
      'challenger2',
      'merkava4',
      't34_85',
      'm61vulcan',
      'bofors40',
      'm777',
    ] as const;

    expect(ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS.map((b) => b.id)).toEqual([
      ...expectedIds,
    ]);

    const liveGlossaryIds = new Set(ENGINEERING_GLOSSARY_TERMS.map((t) => t.id));
    const categoryCounts: Record<string, number> = {};

    ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS.forEach((bp, idx) => {
      const expectedOrder = 91 + idx;
      expect(bp.orderIndex).toBe(expectedOrder);
      expect(bp.bayCode).toBe(`BAY-${expectedOrder}`);
      expect(isCentennialWeaponId(bp.id)).toBe(true);

      categoryCounts[bp.category] = (categoryCounts[bp.category] ?? 0) + 1;

      // Positive finite 1:1 metrology
      expect(bp.year).toBeGreaterThanOrEqual(1415);
      expect(bp.year).toBeLessThanOrEqual(2026);
      expect(bp.overallLengthMm).toBeGreaterThan(500);
      expect(bp.barrelLengthMm).toBeGreaterThan(200);
      expect(bp.emptyWeightKg).toBeGreaterThan(0.5);
      expect(bp.muzzleVelocityMs).toBeGreaterThan(40);
      expect(bp.effectiveRangeM).toBeGreaterThan(50);
      expect(bp.rateOfFireRpm).toBeGreaterThan(0);
      expect(bp.peakPressureMpa).toBeGreaterThan(0);
      expect(bp.magCapacity).toBeGreaterThanOrEqual(1);
      expect(bp.boreAxisMm).toBeGreaterThan(0);
      expect(bp.recoilImpulseNs).toBeGreaterThan(0);
      expect(bp.muzzleEnergyJ).toBeGreaterThan(50);

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

    // Exact hall distribution: 3 archery, 4 armor, 3 ordnance
    expect(categoryCounts).toEqual({
      archery: 3,
      armor: 4,
      ordnance: 3,
    });
  });
});

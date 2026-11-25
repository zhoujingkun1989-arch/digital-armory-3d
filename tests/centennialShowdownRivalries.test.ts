import { describe, expect, it } from 'vitest';
import {
  CLASSIC_RIVALRY_SEEDS,
  SHOWDOWN_RADAR_AXES,
  buildShowdownDualSvgGeometry,
  buildShowdownRadarGeometry,
  computeWeaponRadarMetrics,
  findMatchingRivalryPreset,
  getClassicRivalryPresets,
  getShowdownExhibitProfile,
  getSuggestedRivalWeaponId,
} from '../src/features/armory/mechanismShowdownSpecs';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const FULLWIDTH_RE = /[\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+\b/i;

const EXPECTED_CENTENNIAL_12_RIVALRIES: ReadonlyArray<{
  readonly id: string;
  readonly weaponA: WeaponId;
  readonly weaponB: WeaponId;
}> = [
  { id: 'ak47_vs_m16a1', weaponA: 'ak47', weaponB: 'm16a1' },
  { id: 'fnfal_vs_g3a3', weaponA: 'fnfal', weaponB: 'g3a3' },
  { id: 'ppsh41_vs_mp40', weaponA: 'ppsh41', weaponB: 'mp40' },
  { id: 'mosin_vs_leeenfield', weaponA: 'mosin', weaponB: 'leeenfield' },
  { id: 't90m_vs_merkava4', weaponA: 't90m', weaponB: 'merkava4' },
  { id: 'saa1873_vs_sw500', weaponA: 'saa1873', weaponB: 'sw500' },
  { id: 'gau8_vs_m61vulcan', weaponA: 'gau8', weaponB: 'm61vulcan' },
  { id: 'spas12_vs_aa12', weaponA: 'spas12', weaponB: 'aa12' },
  { id: 'beretta92_vs_p226', weaponA: 'beretta92', weaponB: 'p226' },
  { id: 'stg44_vs_ak47', weaponA: 'stg44', weaponB: 'ak47' },
  { id: 'famas_vs_aug', weaponA: 'famas', weaponB: 'aug' },
  { id: 'bofors40_vs_m777', weaponA: 'bofors40', weaponB: 'm777' },
];

describe('Phase 4B — 12 Iconic Centennial Showdown Rivalries (30 -> 42)', () => {
  it('locks exact 42 unique curated rivalries with valid distinct WeaponIds and zero unordered-pair duplicates', () => {
    const validIds = new Set<string>(WEAPON_IDS);
    expect(CLASSIC_RIVALRY_SEEDS).toHaveLength(42);
    expect(getClassicRivalryPresets('zh')).toHaveLength(42);
    expect(getClassicRivalryPresets('en')).toHaveLength(42);

    const seenIds = new Set<string>();
    const seenPairs = new Set<string>();

    for (const seed of CLASSIC_RIVALRY_SEEDS) {
      expect(seenIds.has(seed.id), `Duplicate rivalry id: ${seed.id}`).toBe(
        false
      );
      seenIds.add(seed.id);

      expect(
        validIds.has(seed.weaponA),
        `Invalid weaponA "${seed.weaponA}" in ${seed.id}`
      ).toBe(true);
      expect(
        validIds.has(seed.weaponB),
        `Invalid weaponB "${seed.weaponB}" in ${seed.id}`
      ).toBe(true);
      expect(
        seed.weaponA,
        `Self-rivalry in ${seed.id}`
      ).not.toBe(seed.weaponB);

      const pairKey = [seed.weaponA, seed.weaponB].sort().join('::');
      expect(
        seenPairs.has(pairKey),
        `Duplicate unordered pair ${pairKey} in ${seed.id}`
      ).toBe(false);
      seenPairs.add(pairKey);
    }

    for (const expected of EXPECTED_CENTENNIAL_12_RIVALRIES) {
      const matched = CLASSIC_RIVALRY_SEEDS.find((s) => s.id === expected.id);
      expect(matched, `Missing Centennial rivalry ${expected.id}`).toBeDefined();
      expect(matched!.weaponA).toBe(expected.weaponA);
      expect(matched!.weaponB).toBe(expected.weaponB);

      const fwd = findMatchingRivalryPreset(
        expected.weaponA,
        expected.weaponB,
        'en'
      );
      const rev = findMatchingRivalryPreset(
        expected.weaponB,
        expected.weaponA,
        'zh'
      );
      expect(fwd?.id).toBe(expected.id);
      expect(rev?.id).toBe(expected.id);

      const suggestedA = getSuggestedRivalWeaponId(expected.weaponA);
      expect(validIds.has(suggestedA)).toBe(true);
      expect(suggestedA).not.toBe(expected.weaponA);
    }
  });

  it('enforces zero EN CJK, zero EN fullwidth punctuation, zero WP-XX leaks, and crisp bilingual editorial copy across all 42 rivalries', () => {
    for (const seed of CLASSIC_RIVALRY_SEEDS) {
      expect(seed.pillLabel.zh.trim().length).toBeGreaterThan(4);
      expect(seed.pillLabel.en.trim().length).toBeGreaterThan(4);
      expect(seed.headline.zh.trim().length).toBeGreaterThan(12);
      expect(seed.headline.en.trim().length).toBeGreaterThan(16);
      expect(seed.verdict.zh.trim().length).toBeGreaterThan(30);
      expect(seed.verdict.en.trim().length).toBeGreaterThan(50);

      for (const enStr of [
        seed.pillLabel.en,
        seed.headline.en,
        seed.verdict.en,
      ]) {
        expect(enStr, `CJK in EN (${seed.id}): ${enStr}`).not.toMatch(CJK_RE);
        expect(enStr, `Fullwidth in EN (${seed.id}): ${enStr}`).not.toMatch(
          FULLWIDTH_RE
        );
        expect(enStr, `WP-XX leak in EN (${seed.id}): ${enStr}`).not.toMatch(
          WP_LEAK_RE
        );
      }

      for (const zhStr of [
        seed.pillLabel.zh,
        seed.headline.zh,
        seed.verdict.zh,
      ]) {
        expect(zhStr, `WP-XX leak in ZH (${seed.id}): ${zhStr}`).not.toMatch(
          WP_LEAK_RE
        );
      }
    }
  });

  it('computes finite 6-axis radar geometry and dual ballistic SVG curves across all 12 Centennial rivalries', () => {
    for (const { id, weaponA, weaponB } of EXPECTED_CENTENNIAL_12_RIVALRIES) {
      const profA = getShowdownExhibitProfile(weaponA, 'en');
      const profB = getShowdownExhibitProfile(weaponB, 'en');

      expect(profA.muzzleVelocityMps, `${id} velA`).toBeGreaterThan(80);
      expect(profB.muzzleVelocityMps, `${id} velB`).toBeGreaterThan(80);
      expect(profA.muzzleEnergyJ, `${id} energyA`).toBeGreaterThan(100);
      expect(profB.muzzleEnergyJ, `${id} energyB`).toBeGreaterThan(100);

      const radarA = computeWeaponRadarMetrics(weaponA);
      const radarB = computeWeaponRadarMetrics(weaponB);
      for (const axis of SHOWDOWN_RADAR_AXES) {
        expect(Number.isFinite(radarA[axis.id])).toBe(true);
        expect(radarA[axis.id]).toBeGreaterThanOrEqual(0);
        expect(radarA[axis.id]).toBeLessThanOrEqual(100);
        expect(Number.isFinite(radarB[axis.id])).toBe(true);
        expect(radarB[axis.id]).toBeGreaterThanOrEqual(0);
        expect(radarB[axis.id]).toBeLessThanOrEqual(100);
      }

      const radarGeo = buildShowdownRadarGeometry(radarA, radarB);
      expect(radarGeo.vertices).toHaveLength(SHOWDOWN_RADAR_AXES.length);
      expect(radarGeo.polygonA).not.toContain('NaN');
      expect(radarGeo.polygonB).not.toContain('NaN');

      for (const mode of ['normalized', 'relative'] as const) {
        const dualSvg = buildShowdownDualSvgGeometry(weaponA, weaponB, mode);
        expect(dualSvg.traceA.pressureLinePath.length).toBeGreaterThan(20);
        expect(dualSvg.traceB.pressureLinePath.length).toBeGreaterThan(20);
        expect(dualSvg.traceA.velocityLinePath.length).toBeGreaterThan(20);
        expect(dualSvg.traceB.velocityLinePath.length).toBeGreaterThan(20);
        expect(dualSvg.traceA.pressureLinePath).not.toContain('NaN');
        expect(dualSvg.traceB.pressureLinePath).not.toContain('NaN');
        expect(Number.isFinite(dualSvg.traceA.peakMarker.x)).toBe(true);
        expect(Number.isFinite(dualSvg.traceB.peakMarker.x)).toBe(true);
      }
    }
  });
});

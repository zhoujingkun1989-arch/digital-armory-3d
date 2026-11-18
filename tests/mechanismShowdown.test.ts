import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildShowdownDualSvgGeometry,
  CLASSIC_RIVALRY_SEEDS,
  consumePendingShowdownLaunch,
  DRIVE_FAMILIES,
  FEED_FAMILIES,
  findMatchingRivalryPreset,
  getActiveShowdownWeaponIds,
  getClassicRivalryPresets,
  getLocalizedAxisMeta,
  getShowdownExhibitProfile,
  getSuggestedRivalWeaponId,
  getTaxonomyFamiliesForAxis,
  interpolateShowdownCurveAt,
  LOCKING_FAMILIES,
  MECHANISM_TAXONOMY_AXES,
  queueMechanismShowdownLaunch,
  sampleShowdownBallisticsCurve,
  SHOWDOWN_EXHIBIT_SPECS,
} from '../src/features/armory/mechanismShowdownSpecs';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { ARMORY_WEAPONS } from '../src/weapons/manifests';
import { WEAPON_IDS } from '../src/weapons/types';

const CJK_RE = /[\u4e00-\u9fff]/;

describe('WP-11 · Mechanism Showdown Lineage Matrix & Dual-Exhibit Lab', () => {
  it('partitions all 16 active WEAPON_IDS cleanly across all 3 canonical taxonomy axes with zero empty families', () => {
    const activeIds = getActiveShowdownWeaponIds();
    expect(activeIds).toHaveLength(16);
    expect(activeIds).toEqual(ARMORY_WEAPONS.map((w) => w.id));
    expect(new Set(activeIds)).toEqual(new Set(WEAPON_IDS));

    for (const axis of MECHANISM_TAXONOMY_AXES) {
      const families = getTaxonomyFamiliesForAxis(axis.id, 'zh', activeIds);
      expect(families.length).toBeGreaterThan(0);

      const seen: string[] = [];
      for (const fam of families) {
        expect(fam.exhibitIds.length).toBeGreaterThan(0);
        seen.push(...fam.exhibitIds);
      }

      // Exact disjoint partition over all active vault exhibits
      expect(seen.length).toBe(activeIds.length);
      expect(new Set(seen)).toEqual(new Set(activeIds));
    }
  });

  it('scales seamlessly from 13 to 16 exhibits when python, benellim4, and garand join WEAPON_IDS', () => {
    const wave2Ids = Array.from(
      new Set([...WEAPON_IDS, 'python', 'benellim4', 'garand'])
    );
    expect(wave2Ids.length).toBeGreaterThanOrEqual(16);

    // Specific canonical taxonomy assignments for the 3 Wave-2 exhibits
    expect(SHOWDOWN_EXHIBIT_SPECS.python.driveFamily).toBe(
      'manual_bolt_or_revolver_linkage'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.python.lockingFamily).toBe(
      'cylinder_notch_ratchet'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.python.feedFamily).toBe('swing_out_cylinder');

    expect(SHOWDOWN_EXHIBIT_SPECS.benellim4.driveFamily).toBe(
      'short_stroke_piston'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.benellim4.lockingFamily).toBe(
      'rotating_lug_bolt'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.benellim4.feedFamily).toBe(
      'underbarrel_tubular_elevator'
    );

    expect(SHOWDOWN_EXHIBIT_SPECS.garand.driveFamily).toBe(
      'long_stroke_piston'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.garand.lockingFamily).toBe(
      'rotating_lug_bolt'
    );
    expect(SHOWDOWN_EXHIBIT_SPECS.garand.feedFamily).toBe('top_enbloc_clip');

    // With all 16 exhibits active, every single Drive (7), Locking (5), and Feed (6) family is populated
    const drive16 = getTaxonomyFamiliesForAxis('drive', 'en', wave2Ids);
    const locking16 = getTaxonomyFamiliesForAxis('locking', 'en', wave2Ids);
    const feed16 = getTaxonomyFamiliesForAxis('feed', 'en', wave2Ids);

    expect(drive16.length).toBe(DRIVE_FAMILIES.length);
    expect(locking16.length).toBe(LOCKING_FAMILIES.length);
    expect(feed16.length).toBe(FEED_FAMILIES.length);

    // Wave-2 classic rivalries activate automatically
    const presets16 = getClassicRivalryPresets('en', wave2Ids);
    const presetIds = presets16.map((p) => p.id);
    expect(presetIds).toContain('ak15_vs_garand');
    expect(presetIds).toContain('python_vs_deagle');
    expect(presetIds).toContain('benellim4_vs_scar');
  });

  it('enforces 100% bilingual zh/en completeness with zero CJK leaks in English across all 16 exhibit specs & UI copy', () => {
    const allKnownIds = Array.from(
      new Set([...WEAPON_IDS, ...Object.keys(SHOWDOWN_EXHIBIT_SPECS)])
    );

    // 1. UI_STRINGS.mechanismShowdown strings & formatter functions
    for (const lang of ['zh', 'en'] as const) {
      const dict = UI_STRINGS[lang].mechanismShowdown;
      const sampleStrings: string[] = [
        dict.entryBtn,
        dict.entryBtnTitle,
        dict.plaqueCompareBtn('M4A1'),
        dict.plaqueCompareTitle('AK-15M1', 'M4A1'),
        dict.dialogAria,
        dict.badge,
        dict.exhibitCountPill(16, 3),
        dict.title,
        dict.subtitle,
        dict.modeMatrix,
        dict.modeShowdown,
        dict.closeTitle,
        dict.stagingLabel,
        dict.stagingHint,
        dict.slotALabel,
        dict.slotBLabel,
        dict.swapPairTitle,
        dict.openShowdownCta,
        dict.allAxesTab,
        dict.familyCountBadge(1),
        dict.familyCountBadge(4),
        dict.prosLabel,
        dict.consLabel,
        dict.compareWithSlotBtn,
        dict.compareWithRivalBtn,
        dict.presetsLabel,
        dict.selectWeaponAAria,
        dict.selectWeaponBAria,
        dict.sharedTraitBadge,
        dict.diffTraitBadge,
        dict.axisShortDrive,
        dict.axisShortLocking,
        dict.axisShortFeed,
        dict.cutawayBenchBtn('AK-15M1'),
        dict.cutawayBenchTitle,
        dict.liveCycleBenchBtn,
        dict.liveCycleBenchTitle,
        dict.chartTitle,
        dict.chartSub,
        dict.scaleNormalized,
        dict.scaleRelative,
        dict.crossDomainNote,
        dict.legendPressure('AK-15M1'),
        dict.legendVelocity('AK-15M1'),
        dict.scrubReadoutLabel(24),
        dict.scrubHoverHint,
        dict.axisProgressLabel,
        dict.metricsTitle,
        dict.metricsSub,
        dict.metricVelocity,
        dict.metricEnergy,
        dict.metricPeakLoad,
        dict.metricCyclic,
        dict.metricOalBarrel,
        dict.metricMassParts,
        dict.archBreakdownTitle,
        dict.rowDrive,
        dict.rowLocking,
        dict.rowFeed,
        dict.rowFireControl,
        dict.rowVerdict,
        dict.strengthTag,
        dict.tradeoffTag,
      ];

      for (const str of sampleStrings) {
        expect(str.trim().length).toBeGreaterThan(0);
        if (lang === 'en') {
          expect(str).not.toMatch(CJK_RE);
        }
      }
    }

    // 2. Taxonomy axes & all families (including Wave-2 families via includeEmpty=true)
    for (const axis of MECHANISM_TAXONOMY_AXES) {
      const zhAxis = getLocalizedAxisMeta(axis.id, 'zh');
      const enAxis = getLocalizedAxisMeta(axis.id, 'en');
      expect(zhAxis.title.trim().length).toBeGreaterThan(2);
      expect(enAxis.title.trim().length).toBeGreaterThan(2);
      expect(enAxis.title).not.toMatch(CJK_RE);
      expect(enAxis.subtitle).not.toMatch(CJK_RE);

      const zhFams = getTaxonomyFamiliesForAxis(
        axis.id,
        'zh',
        allKnownIds,
        true
      );
      const enFams = getTaxonomyFamiliesForAxis(
        axis.id,
        'en',
        allKnownIds,
        true
      );
      expect(zhFams.length).toBe(enFams.length);

      for (let i = 0; i < enFams.length; i++) {
        const zf = zhFams[i];
        const ef = enFams[i];
        expect(zf.title.trim().length).toBeGreaterThan(2);
        expect(zf.principle.trim().length).toBeGreaterThan(8);
        expect(zf.pros.trim().length).toBeGreaterThan(4);
        expect(zf.cons.trim().length).toBeGreaterThan(4);

        expect(ef.badge).not.toMatch(CJK_RE);
        expect(ef.title).not.toMatch(CJK_RE);
        expect(ef.principle).not.toMatch(CJK_RE);
        expect(ef.pros).not.toMatch(CJK_RE);
        expect(ef.cons).not.toMatch(CJK_RE);
      }
    }

    // 3. All 16 Exhibit Profiles & Classic Rivalries
    for (const id of allKnownIds) {
      const zhProf = getShowdownExhibitProfile(id, 'zh');
      const enProf = getShowdownExhibitProfile(id, 'en');

      const zhFields = [
        zhProf.shortLabel,
        zhProf.fullName,
        zhProf.originTag,
        zhProf.caliberLabel,
        zhProf.compactCaliber,
        zhProf.driveFamilyTitle,
        zhProf.lockingFamilyTitle,
        zhProf.feedFamilyTitle,
        zhProf.driveDetail,
        zhProf.lockingDetail,
        zhProf.feedDetail,
        zhProf.fireControlDetail,
        zhProf.signatureAdvantage,
        zhProf.engineeringTradeoff,
        zhProf.rateOfFireDisplay,
      ];
      for (const val of zhFields) {
        expect(val.trim().length, `${id} zh field empty`).toBeGreaterThan(0);
      }

      const enFields = [
        enProf.shortLabel,
        enProf.fullName,
        enProf.originTag,
        enProf.caliberLabel,
        enProf.compactCaliber,
        enProf.driveFamilyTitle,
        enProf.driveFamilyBadge,
        enProf.lockingFamilyTitle,
        enProf.lockingFamilyBadge,
        enProf.feedFamilyTitle,
        enProf.feedFamilyBadge,
        enProf.driveDetail,
        enProf.lockingDetail,
        enProf.feedDetail,
        enProf.fireControlDetail,
        enProf.signatureAdvantage,
        enProf.engineeringTradeoff,
        enProf.peakLoadFormatted,
        enProf.rateOfFireDisplay,
      ];
      for (const val of enFields) {
        expect(val.trim().length, `${id} en field empty`).toBeGreaterThan(0);
        expect(val, `${id} en CJK leak: ${val}`).not.toMatch(CJK_RE);
      }
    }

    for (const seed of CLASSIC_RIVALRY_SEEDS) {
      expect(seed.weaponA).not.toBe(seed.weaponB);
      expect(seed.pillLabel.zh.trim().length).toBeGreaterThan(4);
      expect(seed.pillLabel.en).not.toMatch(CJK_RE);
      expect(seed.headline.en).not.toMatch(CJK_RE);
      expect(seed.verdict.en).not.toMatch(CJK_RE);
    }
  });

  it('computes accurate quantitative metrics, barrel-length velocity scaling, and finite SVG dual-curve paths', () => {
    const allIds = Array.from(
      new Set([...WEAPON_IDS, 'python', 'benellim4', 'garand'])
    );

    for (const id of allIds) {
      const prof = getShowdownExhibitProfile(id, 'en');
      expect(Number.isFinite(prof.peakLoadValue)).toBe(true);
      expect(prof.peakLoadValue).toBeGreaterThan(40);
      expect(Number.isFinite(prof.muzzleVelocityMps)).toBe(true);
      expect(prof.muzzleVelocityMps).toBeGreaterThan(80);
      expect(Number.isFinite(prof.muzzleEnergyJ)).toBe(true);
      expect(prof.muzzleEnergyJ).toBeGreaterThan(100);
      expect(prof.overallLengthMm).toBeGreaterThan(150);
      expect(prof.barrelOrStrokeMm).toBeGreaterThan(90);
      expect(prof.emptyWeightKg).toBeGreaterThan(0.4);
      expect(prof.partsCount).toBeGreaterThanOrEqual(20);

      expect(prof.timing.ignitionF).toBeGreaterThan(0);
      expect(prof.timing.peakF).toBeGreaterThan(prof.timing.ignitionF);
      expect(prof.timing.muzzleExitF).toBeGreaterThan(prof.timing.peakF);
      expect(prof.timing.ejectF).toBeGreaterThan(prof.timing.muzzleExitF);
      expect(prof.timing.batteryF).toBeGreaterThan(prof.timing.ejectF);
      expect(prof.timing.batteryF).toBeLessThanOrEqual(1);

      const pts = sampleShowdownBallisticsCurve(id, 64);
      expect(pts.length).toBeGreaterThanOrEqual(65);
      let maxP01 = 0;
      for (const pt of pts) {
        expect(Number.isFinite(pt.f)).toBe(true);
        expect(Number.isFinite(pt.pressure01)).toBe(true);
        expect(Number.isFinite(pt.pressureRaw)).toBe(true);
        expect(Number.isFinite(pt.velocity01)).toBe(true);
        expect(Number.isFinite(pt.velocityMps)).toBe(true);
        expect(Number.isFinite(pt.energyJ)).toBe(true);
        expect(pt.pressure01).toBeGreaterThanOrEqual(0);
        expect(pt.pressure01).toBeLessThanOrEqual(1.0001);
        expect(pt.velocity01).toBeGreaterThanOrEqual(0);
        expect(pt.velocity01).toBeLessThanOrEqual(1.0001);
        if (pt.pressure01 > maxP01) maxP01 = pt.pressure01;
      }
      expect(maxP01).toBeGreaterThan(0.95);
      expect(pts[pts.length - 1].velocityMps).toBeCloseTo(
        prof.muzzleVelocityMps,
        2
      );

      const midSample = interpolateShowdownCurveAt(pts, prof.timing.peakF);
      expect(midSample.pressure01).toBeGreaterThan(0.9);
    }

    // Verify barrel-length physics differentiation on 5.56 NATO (AUG 508mm > M4A1 368mm > SCAR 355mm)
    const aug = getShowdownExhibitProfile('aug', 'en');
    const m4a1 = getShowdownExhibitProfile('m4a1', 'en');
    const scar = getShowdownExhibitProfile('scar', 'en');
    expect(aug.muzzleVelocityMps).toBeGreaterThan(m4a1.muzzleVelocityMps);
    expect(m4a1.muzzleVelocityMps).toBeGreaterThan(scar.muzzleVelocityMps);
    expect(aug.muzzleEnergyJ).toBeGreaterThan(m4a1.muzzleEnergyJ);
    expect(m4a1.muzzleEnergyJ).toBeGreaterThan(scar.muzzleEnergyJ);

    // Verify comma-formatted OAL (`1,448 mm`) and non-RPM archery strings (`70 lb`) parse accurately
    const m82 = getShowdownExhibitProfile('m82a1', 'en');
    expect(m82.overallLengthMm).toBe(1448);
    expect(m82.muzzleEnergyJ).toBeGreaterThan(15000);
    const lift = getShowdownExhibitProfile('lift33', 'en');
    expect(lift.isArchery).toBe(true);
    expect(lift.peakLoadUnit).toBe('N');
    expect(lift.cyclicRateRpm).toBeNull();

    // Verify live Wave-2 exhibit profiles (python .357, benellim4 12ga, garand .30-06)
    const python = getShowdownExhibitProfile('python', 'en');
    const benelli = getShowdownExhibitProfile('benellim4', 'en');
    const garand = getShowdownExhibitProfile('garand', 'en');
    expect(python.peakLoadValue).toBe(241);
    expect(python.cyclicRateRpm).toBeNull();
    expect(benelli.peakLoadValue).toBe(79);
    expect(benelli.overallLengthMm).toBe(1010);
    expect(garand.peakLoadValue).toBe(345);
    expect(garand.cyclicRateRpm).toBeNull();
    expect(garand.muzzleEnergyJ).toBeGreaterThan(3500);

    // Verify SVG dual-curve path builder & cross-domain safeguard
    const sameDomainGeo = buildShowdownDualSvgGeometry(
      'ak15',
      'm4a1',
      'relative',
      80
    );
    expect(sameDomainGeo.crossDomain).toBe(false);
    expect(sameDomainGeo.effectiveScaleMode).toBe('relative');
    expect(sameDomainGeo.traceA.pressureLinePath).toMatch(/^M\d/);
    expect(sameDomainGeo.traceA.pressureLinePath).not.toContain('NaN');
    expect(sameDomainGeo.traceB.velocityLinePath).not.toContain('NaN');
    expect(sameDomainGeo.traceA.peakMarker.x).toBeGreaterThan(
      sameDomainGeo.plotLeft
    );
    expect(sameDomainGeo.traceA.peakMarker.x).toBeLessThan(
      sameDomainGeo.plotRight
    );

    const crossDomainGeo = buildShowdownDualSvgGeometry(
      'ak15',
      'r500',
      'relative',
      80
    );
    expect(crossDomainGeo.crossDomain).toBe(true);
    expect(crossDomainGeo.effectiveScaleMode).toBe('normalized');
  });

  it('provides all 10 symmetric rivalry presets, distinct suggested rivals, Showcase handoff queue, and clean Armory/CSS wiring', () => {
    const activePresets = getClassicRivalryPresets('zh');
    expect(activePresets).toHaveLength(CLASSIC_RIVALRY_SEEDS.length);
    expect(activePresets).toHaveLength(10);

    queueMechanismShowdownLaunch('matrix', 'garand');
    const queued = consumePendingShowdownLaunch();
    expect(queued).toEqual({
      mode: 'matrix',
      weaponA: 'garand',
      weaponB: 'ak15',
    });
    expect(consumePendingShowdownLaunch()).toBeNull();

    for (const preset of activePresets) {
      expect(preset.weaponA).not.toBe(preset.weaponB);
      expect(WEAPON_IDS).toContain(preset.weaponA);
      expect(WEAPON_IDS).toContain(preset.weaponB);

      // Order-independent rivalry lookup
      expect(
        findMatchingRivalryPreset(preset.weaponA, preset.weaponB, 'en')?.id
      ).toBe(preset.id);
      expect(
        findMatchingRivalryPreset(preset.weaponB, preset.weaponA, 'en')?.id
      ).toBe(preset.id);
    }

    for (const id of WEAPON_IDS) {
      const rival = getSuggestedRivalWeaponId(id);
      expect(rival).not.toBe(id);
      expect(WEAPON_IDS).toContain(rival);
    }

    // Stylesheet & ArmoryView trigger wiring contract
    const indexCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/index.css'),
      'utf8'
    );
    const showdownCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/showdown.css'),
      'utf8'
    );
    const armoryViewSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/features/armory/ArmoryView.tsx'),
      'utf8'
    );

    expect(indexCss).toContain("@import './showdown.css';");
    expect(showdownCss).toContain('pointer-events: auto');
    expect(showdownCss).toContain("[data-theme='light']");
    expect(armoryViewSrc).toContain('armory-showdown-btn');
    expect(armoryViewSrc).toContain('plaque-showdown-cta');
    expect(armoryViewSrc).toContain('LazyMechanismShowdownModal');
  });
});

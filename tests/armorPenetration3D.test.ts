import { describe, expect, it } from 'vitest';
import {
  ARMOR_TARGET_TANK_IDS,
  ARMOR_ZONE_IDS,
  evaluateArmorPenetration,
  PENETRATOR_IDS,
} from '../src/engine/physics/armorPenetration';
import {
  buildArmorTheaterLayout,
  createArmorTheaterFrameState,
  evaluateArmorTheaterFrame,
  evaluateArmorTheaterFrameInto,
  evaluateSpallParticleInto,
  evaluateSparkParticleInto,
  type ParticleTransformOut,
  SPALL_PARTICLE_COUNT,
  SPARK_PARTICLE_COUNT,
  THEATER_T_DEFEAT_STALL,
  THEATER_T_IMPACT,
  THEATER_T_PERFORATION_EXIT,
  THEATER_T_RICOCHET_PIVOT_END,
} from '../src/features/armorlab/armorPenetration3DMath';
import { ARMOR_PENETRATION_STRINGS } from '../src/features/armorlab/armorPenetrationStrings';

const CJK_REGEX = /[\u4e00-\u9fff]/;

function createParticleScratch(): ParticleTransformOut {
  return {
    x: 0,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 0,
    scaleY: 0,
    scaleZ: 0,
    heat: 0,
    visible: false,
  };
}

describe('Track B1 · 3D Composite Armor Penetration Theater Math', () => {
  it('models full perforation with molten cavity growth, residual rod exit, and behind-armor spall cone', () => {
    const result = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'tiger1',
      zoneId: 'hull_side',
      rangeM: 1000,
      obliquityDeg: 15,
      eraEnabled: false,
    });
    expect(result.outcome).toBe('perforation');

    const layout = buildArmorTheaterLayout(result);
    expect(layout.outcome).toBe('perforation');
    expect(layout.visualTiltDeg).toBeCloseTo(15, 2);
    expect(layout.maxCavityDepthLosCm).toBeCloseTo(layout.totalLosCm, 4);
    expect(layout.spallConeHalfAngleDeg).toBeGreaterThanOrEqual(18);
    expect(layout.spallConeHalfAngleDeg).toBeLessThanOrEqual(38);
    expect(layout.spallLeadVelocityMps).toBeGreaterThan(200);
    expect(layout.residualVelocityMps).toBeGreaterThan(0);

    // Approach phase
    const fApproach = evaluateArmorTheaterFrame(layout, 0.1);
    expect(fApproach.phase).toBe('approach');
    expect(fApproach.rodNoseX).toBeLessThan(0);
    expect(fApproach.cavityDepthLosCm).toBe(0);
    expect(fApproach.spallActive).toBe(false);

    // Mid-penetration phase
    const fMid = evaluateArmorTheaterFrame(layout, 0.42);
    expect(fMid.phase).toBe('penetration');
    expect(fMid.cavityDepthLosCm).toBeGreaterThan(0);
    expect(fMid.cavityDepthLosCm).toBeLessThan(layout.totalLosCm);
    expect(fMid.cavityGlowIntensity).toBeGreaterThan(0.5);
    expect(fMid.rodLengthFraction).toBeLessThan(1);
    expect(fMid.spallActive).toBe(false);

    // Post-exit spall phase
    const fSpall = evaluateArmorTheaterFrame(layout, 0.85);
    expect(fSpall.phase).toBe('perforation_spall');
    expect(fSpall.rodNoseX).toBeGreaterThan(layout.exitXCm);
    expect(fSpall.cavityDepthLosCm).toBeCloseTo(layout.totalLosCm, 4);
    expect(fSpall.spallActive).toBe(true);
    expect(fSpall.spallConeLengthCm).toBeGreaterThan(10);
    expect(fSpall.spallConeRadiusCm).toBeGreaterThan(4);
    expect(fSpall.crewAlertIntensity).toBeGreaterThan(0.2);

    // Verify all active spall particles fly strictly inside crew compartment (+X past exit)
    const pOut = createParticleScratch();
    let visibleCount = 0;
    for (let i = 0; i < SPALL_PARTICLE_COUNT; i++) {
      evaluateSpallParticleInto(layout, fSpall, i, pOut);
      if (pOut.visible) {
        visibleCount++;
        expect(pOut.x).toBeGreaterThan(layout.exitXCm);
        const dx = pOut.x - layout.exitXCm;
        const radialDist = Math.hypot(pOut.y + 1.8 * 1, pOut.z);
        expect(Number.isFinite(dx) && Number.isFinite(radialDist)).toBe(true);
        expect(pOut.heat).toBeGreaterThan(0);
      }
    }
    expect(visibleCount).toBeGreaterThan(40);
  });

  it('models partial penetration / defeated arrest with exact layer stopping depth and intact backing plate', () => {
    const result = evaluateArmorPenetration({
      projectileId: '120mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 1500,
      obliquityDeg: 15,
      eraEnabled: true,
    });
    expect(result.outcome).toBe('partial_penetration');

    const layout = buildArmorTheaterLayout(result);
    expect(layout.outcome).toBe('partial_penetration');
    expect(layout.maxCavityDepthLosCm).toBeGreaterThan(0);
    expect(layout.maxCavityDepthLosCm).toBeLessThan(layout.totalLosCm);
    expect(layout.residualVelocityMps).toBe(0);
    expect(layout.spallConeHalfAngleDeg).toBe(0);
    expect(layout.spallLeadVelocityMps).toBe(0);

    // Verify stoppedLayerIndex matches the first non-defeated layer in physics breakdown
    const firstNonDefeated = result.layerBreakdown.findIndex((l) => !l.defeated);
    expect(layout.stoppedLayerIndex).toBe(firstNonDefeated);

    // During boring
    const fBore = evaluateArmorTheaterFrame(layout, 0.45);
    expect(fBore.cavityDepthLosCm).toBeGreaterThan(0);
    expect(fBore.cavityDepthLosCm).toBeLessThan(layout.maxCavityDepthLosCm);
    expect(fBore.currentVelocityMps).toBeGreaterThan(0);

    // After arrest stall
    const fArrest = evaluateArmorTheaterFrame(
      layout,
      THEATER_T_DEFEAT_STALL + 0.14
    );
    expect(fArrest.phase).toBe('defeated_arrest');
    expect(fArrest.rodNoseX).toBeCloseTo(layout.maxCavityDepthLosCm, 4);
    expect(fArrest.cavityDepthLosCm).toBeCloseTo(layout.maxCavityDepthLosCm, 4);
    expect(fArrest.currentVelocityMps).toBe(0);
    expect(fArrest.arrestShockRadiusCm).toBeGreaterThan(2);
    expect(fArrest.arrestShockOpacity).toBeGreaterThan(0);
    expect(fArrest.spallActive).toBe(false);
    expect(fArrest.crewAlertIntensity).toBe(0);
  });

  it('computes twin opposing ERA flyer-plate displacement and detonation flash only when ERA is active', () => {
    const withEraRes = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 1500,
      obliquityDeg: 10,
      eraEnabled: true,
    });
    const noEraRes = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 1500,
      obliquityDeg: 10,
      eraEnabled: false,
    });

    const layoutEra = buildArmorTheaterLayout(withEraRes);
    const layoutNoEra = buildArmorTheaterLayout(noEraRes);

    expect(layoutEra.eraActive).toBe(true);
    expect(layoutEra.eraLayerIndex).toBe(0);
    expect(layoutEra.eraMaxFrontFlyerDistCm).toBeGreaterThan(15);
    expect(layoutNoEra.eraActive).toBe(false);
    expect(layoutNoEra.eraMaxFrontFlyerDistCm).toBe(0);

    // Before impact: ERA intact
    const fPre = evaluateArmorTheaterFrame(layoutEra, THEATER_T_IMPACT - 0.05);
    expect(fPre.eraDetonated).toBe(false);
    expect(fPre.eraFlashIntensity).toBe(0);
    expect(fPre.eraFrontFlyerNormalCm).toBe(0);

    // Just after impact: ERA flashes brightly and launches front & rear flyers
    const fDet = evaluateArmorTheaterFrame(layoutEra, THEATER_T_IMPACT + 0.05);
    expect(fDet.eraDetonated).toBe(true);
    expect(fDet.phase).toBe('era_detonation');
    expect(fDet.eraFlashIntensity).toBeGreaterThan(0.5);

    const fLater = evaluateArmorTheaterFrame(layoutEra, 0.72);
    expect(fLater.eraFrontFlyerNormalCm).toBeGreaterThan(12);
    expect(fLater.eraRearFlyerNormalCm).toBeGreaterThan(2);

    // Front flyer moves strictly outward along outwardNormal; rear moves inward along inwardNormal
    const frontDotOut =
      fLater.eraFrontFlyerOffsetX * layoutEra.outwardNormalX +
      fLater.eraFrontFlyerOffsetY * layoutEra.outwardNormalY;
    const rearDotIn =
      fLater.eraRearFlyerOffsetX * layoutEra.inwardNormalX +
      fLater.eraRearFlyerOffsetY * layoutEra.inwardNormalY;
    expect(frontDotOut).toBeGreaterThan(10);
    expect(rearDotIn).toBeGreaterThan(1.5);

    // Disabled ERA stays completely stationary
    const fNoEra = evaluateArmorTheaterFrame(layoutNoEra, 0.72);
    expect(fNoEra.eraDetonated).toBe(false);
    expect(fNoEra.eraFlashIntensity).toBe(0);
    expect(fNoEra.eraFrontFlyerNormalCm).toBe(0);
    expect(fNoEra.eraFrontFlyerOffsetX).toBe(0);
    expect(fNoEra.eraFrontFlyerOffsetY).toBe(0);
  });

  it('computes outward specular/inelastic ricochet reflection vector and grazing spark spray', () => {
    const result = evaluateArmorPenetration({
      projectileId: '88mm_pzgr39',
      targetTankId: 'm1a2',
      zoneId: 'upper_glacis',
      rangeM: 1000,
      obliquityDeg: 68,
      eraEnabled: false,
    });
    expect(result.outcome).toBe('ricochet');

    const layout = buildArmorTheaterLayout(result);
    expect(layout.outcome).toBe('ricochet');

    // Unit reflection vector
    const ricLen = Math.hypot(layout.ricochetDirX, layout.ricochetDirY);
    expect(ricLen).toBeCloseTo(1, 5);

    // Strictly deflects away from the sloped armor face (positive dot with outward normal)
    const dotOutward =
      layout.ricochetDirX * layout.outwardNormalX +
      layout.ricochetDirY * layout.outwardNormalY;
    expect(dotOutward).toBeGreaterThan(0);
    expect(layout.ricochetDirY).toBeGreaterThan(0);
    expect(layout.spallConeHalfAngleDeg).toBe(0);

    // Post-pivot ricochet flight
    const fDeflect = evaluateArmorTheaterFrame(
      layout,
      THEATER_T_RICOCHET_PIVOT_END + 0.45
    );
    expect(fDeflect.phase).toBe('ricochet_deflect');
    expect(fDeflect.rodNoseY).toBeGreaterThan(4);
    expect(fDeflect.rodPitchRad).toBeGreaterThan(0.15);
    expect(fDeflect.spallActive).toBe(false);
    expect(fDeflect.sparkActive).toBe(true);
    expect(fDeflect.sparkIntensity).toBeGreaterThan(0.1);

    // Grazing spark particles emit along the sloped face
    const pOut = createParticleScratch();
    let sparkCount = 0;
    for (let i = 0; i < SPARK_PARTICLE_COUNT; i++) {
      evaluateSparkParticleInto(layout, fDeflect, i, pOut);
      if (pOut.visible) {
        sparkCount++;
        expect(Number.isFinite(pOut.x) && Number.isFinite(pOut.y)).toBe(true);
        expect(pOut.scaleX).toBeGreaterThan(0);
      }
    }
    expect(sparkCount).toBeGreaterThan(30);
  });

  it('maintains Zero-GC in-place mutation and finite outputs across all penetrators, tanks, zones, and obliquities', () => {
    const reusable = createArmorTheaterFrameState();
    const sampleProgresses = [-0.1, 0, 0.15, THEATER_T_IMPACT, 0.4, THEATER_T_PERFORATION_EXIT, 0.8, 1.0, 1.25];

    for (const projectileId of PENETRATOR_IDS) {
      for (const targetTankId of ARMOR_TARGET_TANK_IDS) {
        for (const zoneId of ARMOR_ZONE_IDS) {
          for (const obliquityDeg of [0, 35, 72]) {
            const res = evaluateArmorPenetration({
              projectileId,
              targetTankId,
              zoneId,
              rangeM: 1500,
              obliquityDeg,
              eraEnabled: true,
            });
            const layout = buildArmorTheaterLayout(res);
            expect(layout.layers.length).toBeGreaterThan(0);
            expect(Number.isFinite(layout.totalLosCm)).toBe(true);
            expect(Number.isFinite(layout.recommendedCameraDistanceCm)).toBe(
              true
            );

            for (const p of sampleProgresses) {
              const returned = evaluateArmorTheaterFrameInto(
                layout,
                p,
                reusable
              );
              expect(returned).toBe(reusable);
              expect(reusable.progress).toBeGreaterThanOrEqual(0);
              expect(reusable.progress).toBeLessThanOrEqual(1);
              expect(Number.isFinite(reusable.rodNoseX)).toBe(true);
              expect(Number.isFinite(reusable.rodNoseY)).toBe(true);
              expect(Number.isFinite(reusable.cavityDepthLosCm)).toBe(true);
              expect(Number.isFinite(reusable.eraFrontFlyerOffsetX)).toBe(true);
              expect(Number.isFinite(reusable.currentVelocityMps)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('provides complete bilingual 3D theater strings with zero CJK characters in English', () => {
    expect(CJK_REGEX.test(JSON.stringify(ARMOR_PENETRATION_STRINGS.en))).toBe(
      false
    );
    expect(ARMOR_PENETRATION_STRINGS.en.viewModes.theater3d).toBeTruthy();
    expect(ARMOR_PENETRATION_STRINGS.en.viewModes.schematic2d).toBeTruthy();
    expect(ARMOR_PENETRATION_STRINGS.en.viewModes.split).toBeTruthy();
    expect(ARMOR_PENETRATION_STRINGS.zh.viewModes.theater3d).toBeTruthy();
    expect(ARMOR_PENETRATION_STRINGS.zh.theater.phases.era_detonation).toBeTruthy();
    expect(ARMOR_PENETRATION_STRINGS.en.theater.phases.perforation_spall).toBeTruthy();
  });
});

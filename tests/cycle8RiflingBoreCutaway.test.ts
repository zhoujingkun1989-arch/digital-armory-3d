import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RIFLING_EXPLODE_VISIBILITY_MAX,
  shouldShowRiflingBore,
} from '../src/engine/actors/RiflingBoreActor';
import { WEAPON_ATTACHMENT_PROFILES } from '../src/engine/attachments/attachmentSpecs';
import {
  computeRiflingBoreBounds,
  getRiflingTextureSignatureKey,
  getWeaponRiflingSpec,
  WEAPON_RIFLING_SPECS,
} from '../src/engine/ballistics/riflingSpecs';
import { getWeaponManifest } from '../src/weapons/manifests';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

describe('Cycle 8E: True 3D Cutaway Helical Barrel Rifling Bore & Chamber Throat Liner (100 Exhibits)', () => {
  it('1. Registers authentic rifling specs across all 100/100 exhibits with 5 non-rifled archery, 95 barreled exhibits, and 0 CJK in EN', () => {
    expect(Object.keys(WEAPON_RIFLING_SPECS)).toHaveLength(WEAPON_IDS.length);
    expect(WEAPON_IDS).toHaveLength(100);

    const counts = {
      none: 0,
      polygonal: 0,
      smoothbore: 0,
      cut_rifled: 0,
    };

    for (const id of WEAPON_IDS) {
      const spec = getWeaponRiflingSpec(id);
      expect(spec.weaponId).toBe(id);
      counts[spec.kind] += 1;
      expect(spec.labelEn.length).toBeGreaterThan(8);
      expect(spec.labelZh.length).toBeGreaterThan(4);
      expect(CJK_RE.test(spec.labelEn), `${id} labelEn contains CJK`).toBe(
        false
      );
      expect(getRiflingTextureSignatureKey(spec)).toContain(spec.kind);

      if (spec.kind === 'none') {
        expect(spec.grooves).toBe(0);
        expect(spec.boreDiameterMm).toBe(0);
        expect(spec.direction).toBe('none');
      } else if (spec.kind === 'smoothbore') {
        expect(spec.grooves).toBe(0);
        expect(spec.twistInches).toBe(0);
        expect(spec.twistMm).toBe(0);
        expect(spec.direction).toBe('none');
        expect(spec.boreDiameterMm).toBeGreaterThan(15);
        expect(spec.chromeLined).toBe(true);
      } else {
        expect(spec.grooves).toBeGreaterThanOrEqual(3);
        expect(spec.twistInches).toBeGreaterThan(0);
        expect(spec.twistMm).toBeGreaterThan(100);
        expect(['RH', 'LH']).toContain(spec.direction);
        expect(spec.boreDiameterMm).toBeGreaterThan(4);
      }
    }

    expect(counts.none).toBe(5);
    expect(counts.polygonal).toBeGreaterThanOrEqual(3);
    expect(counts.smoothbore).toBeGreaterThanOrEqual(11);
    expect(counts.cut_rifled).toBeGreaterThanOrEqual(70);
    expect(
      counts.none + counts.polygonal + counts.smoothbore + counts.cut_rifled
    ).toBe(100);

    // Historical & engineering pinpoint checks
    expect(WEAPON_RIFLING_SPECS.lift33.kind).toBe('none');
    expect(WEAPON_RIFLING_SPECS.r500.kind).toBe('none');

    expect(WEAPON_RIFLING_SPECS.g17).toMatchObject({
      kind: 'polygonal',
      grooves: 6,
      twistInches: 9.84,
      direction: 'RH',
    });
    expect(WEAPON_RIFLING_SPECS.deagle).toMatchObject({
      kind: 'polygonal',
      grooves: 6,
      twistInches: 19.0,
      direction: 'RH',
    });
    expect(WEAPON_RIFLING_SPECS.mp5).toMatchObject({
      kind: 'polygonal',
      grooves: 6,
      twistInches: 9.84,
      direction: 'RH',
    });

    for (const id of [
      'benellim4',
      'rem870',
      'ztz99a',
      'm1a2',
      'leopard2a7',
    ] as const) {
      expect(WEAPON_RIFLING_SPECS[id].kind).toBe('smoothbore');
      expect(WEAPON_RIFLING_SPECS[id].chromeLined).toBe(true);
    }

    expect(WEAPON_RIFLING_SPECS.m1911).toMatchObject({
      kind: 'cut_rifled',
      grooves: 6,
      twistInches: 16.0,
      direction: 'LH',
    });
    expect(WEAPON_RIFLING_SPECS.tiger1).toMatchObject({
      kind: 'cut_rifled',
      grooves: 32,
      direction: 'RH',
      boreDiameterMm: 88,
    });
    expect(WEAPON_RIFLING_SPECS.gau8).toMatchObject({
      kind: 'cut_rifled',
      grooves: 9,
      twistInches: 39.4,
      direction: 'RH',
      boreDiameterMm: 30,
    });
  });

  it('2. Computes finite, strictly non-protruding bore bounds for all 32 barreled exhibits and returns null for archery', () => {
    expect(computeRiflingBoreBounds('lift33')).toBeNull();
    expect(computeRiflingBoreBounds('r500')).toBeNull();

    let barreledCount = 0;
    for (const id of WEAPON_IDS) {
      const spec = WEAPON_RIFLING_SPECS[id];
      const bounds = computeRiflingBoreBounds(id);
      if (spec.kind === 'none') {
        expect(bounds).toBeNull();
        continue;
      }
      barreledCount += 1;
      expect(bounds, `${id} expected valid RiflingBoreBounds`).not.toBeNull();
      const b = bounds!;
      const meta = getWeaponManifest(id).workbenchMeta;
      const att = WEAPON_ATTACHMENT_PROFILES[id];

      expect(Number.isFinite(b.startX)).toBe(true);
      expect(Number.isFinite(b.endX)).toBe(true);
      expect(Number.isFinite(b.boreY)).toBe(true);
      expect(Number.isFinite(b.boreZ)).toBe(true);
      expect(b.startX).toBeGreaterThan(meta.chamberGlowPos[0]);
      expect(b.endX).toBeGreaterThan(b.startX);
      expect(b.lengthCm).toBeCloseTo(b.endX - b.startX, 5);
      expect(b.endX).toBeLessThan(meta.muzzlePos[0]);
      if (att.muzzleAnchor) {
        expect(b.endX).toBeLessThan(att.muzzleAnchor[0]);
        expect(b.boreY).toBeCloseTo(att.muzzleAnchor[1], 5);
      }
      expect(b.boreRadiusCm).toBeGreaterThan(0);
      expect(b.throatLengthCm).toBeGreaterThan(0);
      expect(b.throatRadiusCm).toBeGreaterThan(b.boreRadiusCm);

      if (spec.kind === 'smoothbore') {
        expect(b.turnsAlongBore).toBe(0);
      } else {
        expect(b.turnsAlongBore).toBeGreaterThan(0);
      }
    }
    expect(barreledCount).toBe(95);

    // Multi-barrel rotary clusters (`gau8`, `m134`) lock strictly onto their top firing-barrel chamberGlowPos Y
    const gau8Bounds = computeRiflingBoreBounds('gau8')!;
    expect(gau8Bounds.boreY).toBeCloseTo(
      getWeaponManifest('gau8').workbenchMeta.chamberGlowPos[1],
      5
    );
    const m134Bounds = computeRiflingBoreBounds('m134')!;
    expect(m134Bounds.boreY).toBeCloseTo(
      getWeaponManifest('m134').workbenchMeta.chamberGlowPos[1],
      5
    );
  });

  it('3. Gates cutaway visibility strictly on Z longitudinal slice, assembled state (< 0.04) and active Z slice intersection', () => {
    expect(
      shouldShowRiflingBore({
        sectionCut: true,
        sectionCutAxis: 'z',
        sectionCutOffset: 0,
        sectionCutFlip: false,
        explodeProgress: 0,
        boreRadiusCm: 0.3,
      })
    ).toBe(true);

    // Flipped Z cutaway keeps +Z half; visible at offset=0 and hidden once slice moves past +boreRadius
    expect(
      shouldShowRiflingBore({
        sectionCut: true,
        sectionCutAxis: 'z',
        sectionCutOffset: 0,
        sectionCutFlip: true,
        explodeProgress: 0.02,
        boreRadiusCm: 0.3,
      })
    ).toBe(true);
    expect(
      shouldShowRiflingBore({
        sectionCut: true,
        sectionCutAxis: 'z',
        sectionCutOffset: 0.5,
        sectionCutFlip: true,
        explodeProgress: 0,
        boreRadiusCm: 0.3,
      })
    ).toBe(false);
    expect(
      shouldShowRiflingBore({
        sectionCut: true,
        sectionCutAxis: 'z',
        sectionCutOffset: -0.5,
        sectionCutFlip: false,
        explodeProgress: 0,
        boreRadiusCm: 0.3,
      })
    ).toBe(false);

    // Hidden when cutaway disabled, non-Z axis, or exploded >= 0.04
    expect(
      shouldShowRiflingBore({
        sectionCut: false,
        sectionCutAxis: 'z',
        sectionCutOffset: 0,
        sectionCutFlip: false,
        explodeProgress: 0,
        boreRadiusCm: 0.3,
      })
    ).toBe(false);
    for (const axis of ['x', 'y', 'box'] as const) {
      expect(
        shouldShowRiflingBore({
          sectionCut: true,
          sectionCutAxis: axis,
          sectionCutOffset: 0,
          sectionCutFlip: false,
          explodeProgress: 0,
          boreRadiusCm: 0.3,
        })
      ).toBe(false);
    }
    expect(
      shouldShowRiflingBore({
        sectionCut: true,
        sectionCutAxis: 'z',
        sectionCutOffset: 0,
        sectionCutFlip: false,
        explodeProgress: RIFLING_EXPLODE_VISIBILITY_MAX,
        boreRadiusCm: 0.3,
      })
    ).toBe(false);
  });

  it('4. Enforces lockLinearTextureColorSpace, Zero-GC useFrame, GPU disposal & mounts in both Workbench and Split 3D viewports', () => {
    const actorSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/RiflingBoreActor.tsx'),
      'utf8'
    );
    expect(actorSrc).toContain('lockLinearTextureColorSpace(normalMap)');
    expect(actorSrc).toContain('lockLinearTextureColorSpace(roughnessMap)');
    expect(actorSrc).toContain('THREE.BackSide');
    expect(actorSrc).toContain('polygonOffsetFactor={-1}');
    expect(actorSrc).toContain('clippingPlanes={SECTION_CUT_PLANES}');
    expect(actorSrc).toContain('geometries.boreGeo.dispose()');
    expect(actorSrc).toContain('geometries.throatGeo.dispose()');
    expect(actorSrc).toContain('entry.suite.albedoMap.dispose()');
    expect(actorSrc).toContain('entry.suite.normalMap.dispose()');
    expect(actorSrc).toContain('entry.suite.roughnessMap.dispose()');

    // Zero `new THREE.` allocations inside useFrame
    const useFrameIdx = actorSrc.indexOf('useFrame(');
    expect(useFrameIdx).toBeGreaterThan(-1);
    const useFrameBlock = actorSrc.slice(
      useFrameIdx,
      actorSrc.indexOf('if (!bounds || !geometries)', useFrameIdx)
    );
    expect(useFrameBlock).not.toMatch(/\bnew\s+THREE\./);
    expect(useFrameBlock).toContain('getArmoryPhysicsState()');
    expect(useFrameBlock).toContain('barrelHeat01');
    expect(useFrameBlock).toContain('carbonFouling01');

    // Mounted cleanly inside Workbench `<WeaponRecoilGroup>` & Split 3D `SplitWeaponSidePortal`
    const viewportSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/canvas/ArmoryViewport.tsx'),
      'utf8'
    );
    const recoilStart = viewportSrc.indexOf('<WeaponRecoilGroup>');
    const recoilEnd = viewportSrc.indexOf('</WeaponRecoilGroup>', recoilStart);
    expect(recoilStart).toBeGreaterThan(-1);
    expect(viewportSrc.slice(recoilStart, recoilEnd)).toContain(
      '<RiflingBoreActor />'
    );

    const splitSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/showdown3d/SplitShowdownViewport.tsx'),
      'utf8'
    );
    expect(splitSrc).toContain(
      '<RiflingBoreActor weaponIdOverride={weaponId} isSplitView />'
    );
  });
});

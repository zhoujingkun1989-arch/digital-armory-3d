import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSearchString } from '../src/app/useUrlStateSync';
import {
  clampSectionCutOffset,
  computeSectionCapTransformInto,
  formatSectionOffsetMm,
  getAxisSectionCutRange,
  getDefaultSectionBoxParams,
  getLiveSectionPlaneCoord,
  SECTION_CUT_BOX_PLANES,
  SECTION_CUT_PLANES,
  syncLiveSectionBoxPlanes,
  syncLiveSectionCutPlane,
} from '../src/engine/actors/StencilSectionCap';
import {
  computeSplitCameraFraming,
  splitShowdownCameraStore,
} from '../src/features/showdown3d/splitShowdownCamera';
import { SPLIT_SHOWDOWN_STRINGS } from '../src/features/showdown3d/splitShowdownStrings';
import { useAppStore } from '../src/store/useAppStore';

const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

describe('Milestone 1: WP-21 Tri-Axial CT Slicer & WP-19 Live 3D Split-Screen Showdown', () => {
  it('WP-21: supports Z / X / Y section planes and 6-plane 3D Slice Box clipping bounds across small arms and 1:1 MBTs', () => {
    const zRange = getAxisSectionCutRange('z', 'rifle');
    const xRange = getAxisSectionCutRange('x', 'rifle');
    const yRange = getAxisSectionCutRange('y', 'rifle');
    expect(zRange.max).toBe(2.5);
    expect(xRange.min).toBe(-38);
    expect(xRange.max).toBe(58);
    expect(yRange.min).toBe(-18);
    expect(yRange.max).toBe(18);

    const tankXRange = getAxisSectionCutRange('x', 'main_battle_tank');
    expect(tankXRange.max).toBe(650);

    // Z / X / Y plane sync keeps normal unit-length and exact coordinate
    syncLiveSectionCutPlane(12.5, false, 'rifle', 'x');
    expect(SECTION_CUT_PLANES[0].normal.toArray()).toEqual([-1, 0, 0]);
    expect(getLiveSectionPlaneCoord(SECTION_CUT_PLANES[0], 'x')).toBeCloseTo(
      12.5,
      4
    );

    syncLiveSectionCutPlane(-6.25, true, 'rifle', 'y');
    expect(SECTION_CUT_PLANES[0].normal.toArray()).toEqual([0, 1, 0]);
    expect(getLiveSectionPlaneCoord(SECTION_CUT_PLANES[0], 'y')).toBeCloseTo(
      -6.25,
      4
    );

    // Clamping + millimeter telemetry formatting
    expect(clampSectionCutOffset(999, 'rifle', 'x')).toBe(58);
    expect(formatSectionOffsetMm(12.5, 'rifle', 'x')).toBe('+125.0 mm');
    expect(formatSectionOffsetMm(-120, 'main_battle_tank', 'z')).toBe(
      '-1,200 mm'
    );

    // Oriented Pass C cap transform produces valid straddling quad matrices on both X and Y planes
    const box = new THREE.Box3(
      new THREE.Vector3(-10, -5, -2),
      new THREE.Vector3(20, 8, 2)
    );
    const idMat = new THREE.Matrix4();
    const outCapMat = new THREE.Matrix4();

    syncLiveSectionCutPlane(4, false, 'rifle', 'x');
    expect(
      computeSectionCapTransformInto(
        box,
        idMat,
        SECTION_CUT_PLANES[0],
        0.16,
        outCapMat
      )
    ).toBe(true);
    const capPosX = new THREE.Vector3().setFromMatrixPosition(outCapMat);
    expect(capPosX.x).toBeCloseTo(4, 3);

    syncLiveSectionCutPlane(1, false, 'rifle', 'y');
    expect(
      computeSectionCapTransformInto(
        box,
        idMat,
        SECTION_CUT_PLANES[0],
        0.16,
        outCapMat
      )
    ).toBe(true);
    const capPosY = new THREE.Vector3().setFromMatrixPosition(outCapMat);
    expect(capPosY.y).toBeCloseTo(1, 3);

    // 6-plane 3D Slice Box encloses interior point cleanly & rejects exterior point
    const boxDef = getDefaultSectionBoxParams('rifle');
    const planes = syncLiveSectionBoxPlanes(
      boxDef.center,
      boxDef.halfSize,
      'rifle'
    );
    expect(planes).toHaveLength(6);
    const insidePt = new THREE.Vector3(...boxDef.center);
    const outsidePt = new THREE.Vector3(
      boxDef.center[0] + boxDef.halfSize[0] + 5,
      0,
      0
    );
    expect(
      SECTION_CUT_BOX_PLANES.every((pl) => pl.distanceToPoint(insidePt) >= 0)
    ).toBe(true);
    expect(
      SECTION_CUT_BOX_PLANES.some((pl) => pl.distanceToPoint(outsidePt) < 0)
    ).toBe(true);

    // Restore clean default Z centerline plane
    syncLiveSectionCutPlane(0, false, 'rifle', 'z');
  });

  it('WP-19: manages split_showdown routing, linked/independent orbit cameras, normalized MBT framing & EN purity', () => {
    const store = useAppStore.getState();
    store.openSplitShowdown('ztz99a', 'm1a2');
    const next = useAppStore.getState();
    expect(next.screen).toBe('split_showdown');
    expect(next.splitShowdownWeaponA).toBe('ztz99a');
    expect(next.splitShowdownWeaponB).toBe('m1a2');

    // Deep-link serialization includes weaponA and weaponB in split_showdown screen
    const qs = buildSearchString(
      'ztz99a',
      'split_showdown',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '338_lapua',
      '',
      { weaponA: 'ztz99a', weaponB: 'm1a2' }
    );
    expect(qs).toContain('screen=split_showdown');
    expect(qs).toContain('weaponA=ztz99a');
    expect(qs).toContain('weaponB=m1a2');

    // Scale-normalized split framing expands cleanly for 1:1 tanks
    const smallFrame = computeSplitCameraFraming('ak15', 0, 1.0, 0.3, 1.35, 1);
    const tankFrame = computeSplitCameraFraming('ztz99a', 0, 1.0, 0.3, 1.35, 1);
    expect(tankFrame.radius).toBeGreaterThan(smallFrame.radius * 5);
    expect(tankFrame.far).toBe(9000);
    expect(smallFrame.far).toBe(1200);

    // Linked vs independent camera orbit state
    splitShowdownCameraStore.resetPoses();
    splitShowdownCameraStore.setLinked(true);
    const azBefore = splitShowdownCameraStore.poseB.azimuth;
    splitShowdownCameraStore.orbit('A', 0.25, 0);
    expect(splitShowdownCameraStore.poseB.azimuth).toBeCloseTo(
      azBefore + 0.25,
      5
    );
    splitShowdownCameraStore.setLinked(false);
    splitShowdownCameraStore.orbit('A', 0.2, 0);
    expect(splitShowdownCameraStore.poseB.azimuth).toBeCloseTo(
      azBefore + 0.25,
      5
    );
    splitShowdownCameraStore.setLinked(true);
    splitShowdownCameraStore.resetPoses();

    // Bilingual string parity & 0 CJK leaks in English
    expect(Object.keys(SPLIT_SHOWDOWN_STRINGS.en)).toEqual(
      Object.keys(SPLIT_SHOWDOWN_STRINGS.zh)
    );
    for (const val of Object.values(SPLIT_SHOWDOWN_STRINGS.en)) {
      expect(CJK_REGEX.test(val)).toBe(false);
    }

    // Restore store back to showcase cleanly
    store.openShowcase();
  });
});

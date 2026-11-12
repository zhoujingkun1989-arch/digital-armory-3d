import { describe, expect, it } from 'vitest';
import {
  clamp01,
  computePartTransform,
  createMutablePose,
  evaluatePartPoseInto,
  findActiveFiringPhase,
  linearSeg,
  seg,
  smoothstep01,
} from '../src/engine/kinematics/math';
import {
  normalizeTextureFileName,
  resolveAssetUrl,
  resolveTextureUrl,
} from '../src/engine/utils/assetUrl';
import type { FiringPhaseInfo, WeaponPartSpec } from '../src/weapons/types';

describe('kinematics math & asset URL utilities', () => {
  it('clamps and interpolates scalar segments accurately', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.42)).toBeCloseTo(0.42, 6);
    expect(clamp01(1.8)).toBe(1);

    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep01(1)).toBe(1);

    expect(seg(0.1, 0.2, 0.6)).toBe(0);
    expect(seg(0.4, 0.2, 0.6)).toBeCloseTo(0.5, 6);
    expect(seg(0.8, 0.2, 0.6)).toBe(1);

    expect(linearSeg(0.3, 0.2, 0.6)).toBeCloseTo(0.25, 6);
  });

  it('evaluates exploded + firing part poses identically in zero-alloc and tuple helpers', () => {
    const mockPart: WeaponPartSpec = {
      id: 'test_bolt',
      bomCode: 'B-01',
      nameZh: '测试枪机',
      calloutLabel: '测试枪机',
      nameEn: 'Test Bolt',
      group: 'slide',
      material: 'stainless',
      assembledPos: [2.5, 1.0, 0],
      assembledRot: [0, 0, 0.1],
      explodeSteps: [
        {
          range: [0.2, 0.6],
          offset: [-4.0, 2.0, 0],
          rotation: [0.5, 0, 0],
        },
      ],
      calloutDir: 'up',
      calloutStem: 36,
      labelAppearAt: 0.2,
      roleTag: '核心闭锁件',
      description: '单元测试用模拟枪机节点',
    };

    const tupleResult = computePartTransform(mockPart, 0.4);
    const mutable = createMutablePose();
    evaluatePartPoseInto(mockPart, 0.4, false, 0, null, mutable);

    expect(mutable.px).toBeCloseTo(tupleResult.position[0], 6);
    expect(mutable.py).toBeCloseTo(tupleResult.position[1], 6);
    expect(mutable.pz).toBeCloseTo(tupleResult.position[2], 6);
    expect(mutable.rx).toBeCloseTo(tupleResult.rotation[0], 6);
    expect(mutable.ry).toBeCloseTo(tupleResult.rotation[1], 6);
    expect(mutable.rz).toBeCloseTo(tupleResult.rotation[2], 6);

    // Now test firing kinematics composition at explodeT = 0.4, fireF = 0.5
    evaluatePartPoseInto(
      mockPart,
      0.4,
      true,
      0.5,
      () => ({
        pos: [-1.5, 0, 0],
        rot: [0.25, 0, 0],
        scaleX: 0.72,
      }),
      mutable
    );

    // At t = 0.4 (midpoint of [0.2, 0.6]), smoothstep(0.5) = 0.5:
    // px = 2.5 + (-4.0 * 0.5) + (-1.5) = -1.0
    expect(mutable.px).toBeCloseTo(-1.0, 6);
    expect(mutable.py).toBeCloseTo(2.0, 6);
    expect(mutable.rx).toBeCloseTo(0.5, 6);
    expect(mutable.rz).toBeCloseTo(0.1, 6);
    expect(mutable.sx).toBeCloseTo(0.72, 6);
  });

  it('finds the matching firing phase across boundary conditions', () => {
    const phases: FiringPhaseInfo[] = [
      {
        id: 'p1',
        stepNum: '01',
        shortLabel: '待击',
        title: '阶段一',
        range: [0, 0.5],
        description: '前半段',
      },
      {
        id: 'p2',
        stepNum: '02',
        shortLabel: '复进',
        title: '阶段二',
        range: [0.5, 1.0],
        description: '后半段',
      },
    ];

    expect(findActiveFiringPhase(phases, 0).id).toBe('p1');
    expect(findActiveFiringPhase(phases, 0.49).id).toBe('p1');
    expect(findActiveFiringPhase(phases, 0.5).id).toBe('p2');
    expect(findActiveFiringPhase(phases, 1.0).id).toBe('p2');
  });

  it('normalizes legacy PNG texture names to WebP and respects BASE_URL', () => {
    expect(normalizeTextureFileName('/textures/ak_receiver_albedo.png')).toBe(
      'ak_receiver_albedo.webp'
    );
    expect(normalizeTextureFileName('slide_normal.webp')).toBe(
      'slide_normal.webp'
    );
    expect(resolveAssetUrl('/textures/m4a1_upper_albedo.webp')).toMatch(
      /textures\/m4a1_upper_albedo\.webp$/
    );
    expect(resolveTextureUrl('/textures/deagle_chrome_albedo.png')).toMatch(
      /textures\/deagle_chrome_albedo\.webp$/
    );
  });
});

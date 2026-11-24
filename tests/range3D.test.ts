import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  computeBallisticSolution,
  EXTERNAL_PROJECTILE_SPECS,
  interpolateTrajectoryAt,
} from '../src/engine/physics/externalBallistics';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { ExternalBallisticsView } from '../src/features/ballistics/ExternalBallisticsView';
import { Range3DScene } from '../src/features/ballistics/Range3DScene';
import {
  buildRangeTrajectory3D,
  computeAcousticReturnDelayS,
  computeProjectileSpinRateRadS,
  computeWindFlagStates,
  createMutableCameraPose3D,
  createMutableProjectilePose3D,
  DEFAULT_SPEED_OF_SOUND_MPS,
  evaluateBallisticGelCavity,
  evaluateGelCavityPulse01,
  evaluateRangeCameraPoseInto,
  evaluateSteelPendulumAngle,
  evaluateWindFlagFlutterOffset,
  FIRING_LINE_HEIGHT_M,
  GEL_BLOCK_LENGTH_CM,
  getMachGradientHex,
  RANGE_AIM_MODES,
  RANGE_CAMERA_MODES,
  RANGE_SPEED_OPTIONS,
  RANGE_TARGET_TYPES,
  RANGE_YARDAGE_MARKERS_M,
  resolveProjectileVisualStyle,
  sampleProjectilePoseAtTime,
  sampleProjectilePoseAtTimeInto,
  writeMachGradientColorRGB,
} from '../src/features/ballistics/range3DMath';
import { useAppStore } from '../src/store/useAppStore';

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

describe('Track B2 · 3D 1,000m Interactive Firing Range & Slow-Motion Bullet-Cam', () => {
  it('converts RK4 3-DOF solutions accurately into 3D curves across DOPE Dial, Elev-Only, and Raw-Zero modes', () => {
    const sol = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      sightHeightCm: 6.2,
      crosswindMps: 6.0,
    });

    // 1. Full DOPE Dial: hits dead center on steel gong at 800m while visibly arcing against gravity & wind mid-flight
    const trajDope = buildRangeTrajectory3D(sol, 800, 'dope_dial', 'steel_gong');
    expect(trajDope.points.length).toBeGreaterThan(50);
    expect(trajDope.points[0].x).toBe(0);
    expect(trajDope.points[0].y).toBeCloseTo(FIRING_LINE_HEIGHT_M - 0.062, 4);

    const endDope = trajDope.points[trajDope.points.length - 1];
    expect(endDope.x).toBeCloseTo(800, 4);
    expect(endDope.y).toBeCloseTo(FIRING_LINE_HEIGHT_M, 3);
    expect(endDope.z).toBeCloseTo(0, 3);
    expect(trajDope.steelImpact.hit).toBe(true);
    expect(trajDope.steelImpact.hitZone).toBe('bullseye');
    expect(trajDope.steelImpact.radialErrorCm).toBeLessThan(0.1);

    // Mid-flight around 400m must climb meaningfully above LOS (true parabolic arc) and bow upwind (-Z)
    const midPt = trajDope.points.find((p) => Math.abs(p.rangeM - 400) < 3)!;
    expect(midPt.y).toBeGreaterThan(FIRING_LINE_HEIGHT_M + 0.8);
    expect(midPt.z).toBeLessThan(-0.08);

    // 2. Elevation-Only mode: hits target elevation but drifts laterally by exact RK4 windDriftCm
    const trajElev = buildRangeTrajectory3D(sol, 800, 'elev_only', 'steel_gong');
    const rk4At800 = interpolateTrajectoryAt(sol, 800)!;
    expect(Math.abs(trajElev.steelImpact.impactOffsetYCm)).toBeLessThan(0.1);
    expect(trajElev.steelImpact.impactOffsetZCm).toBeCloseTo(
      rk4At800.windDriftCm,
      2
    );
    // At 800m with 6 m/s crosswind, .338 Lapua drifts > 50 cm -> misses 25 cm radius gong
    expect(rk4At800.windDriftCm).toBeGreaterThan(35);
    expect(trajElev.steelImpact.hit).toBe(false);
    expect(trajElev.steelImpact.hitZone).toBe('miss');

    // 3. Raw-Zero mode: exact uncompensated RK4 drop & drift
    const trajRaw = buildRangeTrajectory3D(sol, 800, 'raw_zero', 'steel_gong');
    expect(trajRaw.steelImpact.impactOffsetYCm).toBeCloseTo(rk4At800.dropCm, 2);
    expect(trajRaw.steelImpact.impactOffsetZCm).toBeCloseTo(
      rk4At800.windDriftCm,
      2
    );
    expect(trajRaw.steelImpact.hit).toBe(false);

    // At zeroRangeM (100m) with calm wind, Raw-Zero hits dead-center bullseye
    const solCalm = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      crosswindMps: 0,
    });
    const trajAtZero = buildRangeTrajectory3D(
      solCalm,
      100,
      'raw_zero',
      'steel_gong'
    );
    expect(trajAtZero.steelImpact.hit).toBe(true);
    expect(trajAtZero.steelImpact.hitZone).toBe('bullseye');
    expect(trajAtZero.steelImpact.radialErrorCm).toBeLessThan(0.2);
  });

  it('positions the glowing Mach 1.0 transonic ring precisely with unit velocity tangent and smooth color gradients', () => {
    // 5.56 NATO crosses Mach 1.0 near ~650m -> visible ring inside 1,000m range
    const sol556 = computeBallisticSolution('556_nato', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      crosswindMps: 4.5,
    });
    const traj556 = buildRangeTrajectory3D(sol556, 900, 'dope_dial');
    expect(traj556.machRing.visible).toBe(true);
    expect(traj556.machRing.rangeM).toBeCloseTo(sol556.transonicRangeM!, 3);
    expect(traj556.machRing.x).toBeCloseTo(sol556.transonicRangeM!, 3);
    const tanLen = Math.hypot(
      traj556.machRing.tangentX,
      traj556.machRing.tangentY,
      traj556.machRing.tangentZ
    );
    expect(tanLen).toBeCloseTo(1.0, 5);
    expect(traj556.machRing.tangentX).toBeGreaterThan(0.9);

    // Subsonic .45 ACP & Mach 5 125mm APFSDS have no Mach 1.0 ring inside 1,000m
    const sol45 = computeBallisticSolution('45_acp', { maxRangeM: 300 });
    expect(buildRangeTrajectory3D(sol45, 200).machRing.visible).toBe(false);

    const sol125 = computeBallisticSolution('125mm_apfsds', {
      maxRangeM: 1000,
    });
    expect(buildRangeTrajectory3D(sol125, 1000).machRing.visible).toBe(false);

    // Mach gradient RGB distinguishes supersonic, transonic peak, and subsonic
    const rgbSup: [number, number, number] = [0, 0, 0];
    const rgbTrans: [number, number, number] = [0, 0, 0];
    const rgbSub: [number, number, number] = [0, 0, 0];
    writeMachGradientColorRGB(2.5, rgbSup);
    writeMachGradientColorRGB(1.0, rgbTrans);
    writeMachGradientColorRGB(0.6, rgbSub);

    // Supersonic is cool cyan (high B/G, low R); Mach 1.0 transonic is crimson (high R)
    expect(rgbSup[2]).toBeGreaterThan(rgbSup[0] + 0.5);
    expect(rgbTrans[0]).toBeGreaterThan(0.9);
    expect(rgbSub[2]).toBeGreaterThan(rgbSub[0]);
    expect(getMachGradientHex(1.0)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('computes Zero-GC pose interpolation, tangent pitch/yaw, axial spin, and all 6 projectile visual archetypes', () => {
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['338_lapua'])).toBe('spitzer_brass');
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['9mm_para'])).toBe('pistol_copper');
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['125mm_apfsds'])).toBe('apfsds_tungsten');
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['88mm_pzgr39'])).toBe('apcbc_shell');
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['arrow_400gr'])).toBe('carbon_arrow');
    expect(resolveProjectileVisualStyle(EXTERNAL_PROJECTILE_SPECS['12_gauge'])).toBe('buckshot_cluster');

    // Rifled firearms spin dramatically faster than smoothbore fin-stabilized darts or arrows
    const spin556 = computeProjectileSpinRateRadS(
      EXTERNAL_PROJECTILE_SPECS['556_nato'],
      910
    );
    const spinApfsds = computeProjectileSpinRateRadS(
      EXTERNAL_PROJECTILE_SPECS['125mm_apfsds'],
      1780
    );
    const spinArrow = computeProjectileSpinRateRadS(
      EXTERNAL_PROJECTILE_SPECS['arrow_400gr'],
      106
    );
    expect(spin556).toBeGreaterThan(15000);
    expect(spinApfsds).toBeLessThan(200);
    expect(spinArrow).toBeLessThan(150);

    const sol = computeBallisticSolution('30_06', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      crosswindMps: 5.0,
    });
    const traj = buildRangeTrajectory3D(sol, 600, 'dope_dial', 'steel_gong');

    const pose = createMutableProjectilePose3D();
    const returnedRef = sampleProjectilePoseAtTimeInto(traj, 0.05, pose);
    expect(returnedRef).toBe(pose); // Zero-GC in-place mutation contract

    // Early flight climbs (positive pitch); late flight dives toward target (negative pitch)
    const earlyPose = sampleProjectilePoseAtTime(traj, traj.totalFlightTimeS * 0.12);
    const latePose = sampleProjectilePoseAtTime(traj, traj.totalFlightTimeS * 0.92);
    const impactPose = sampleProjectilePoseAtTime(traj, traj.totalFlightTimeS + 0.25);

    expect(earlyPose.pitchRad).toBeGreaterThan(0);
    expect(latePose.pitchRad).toBeLessThan(0);
    expect(latePose.rangeM).toBeGreaterThan(earlyPose.rangeM);
    expect(latePose.rollRad).toBeGreaterThan(earlyPose.rollRad);
    expect(earlyPose.hasImpacted).toBe(false);
    expect(impactPose.hasImpacted).toBe(true);
    expect(impactPose.postImpactTimeS).toBeCloseTo(0.25, 5);
    expect(impactPose.progress01).toBe(1);
  });

  it('computes exact speed-of-sound acoustic return delay (distance / 343) and physical steel pendulum recoil swing', () => {
    expect(DEFAULT_SPEED_OF_SOUND_MPS).toBe(343);
    expect(computeAcousticReturnDelayS(0)).toBe(0);
    expect(computeAcousticReturnDelayS(343)).toBeCloseTo(1.0, 6);
    expect(computeAcousticReturnDelayS(686)).toBeCloseTo(2.0, 6);
    expect(computeAcousticReturnDelayS(1000)).toBeCloseTo(1000 / 343, 6);

    const sol9 = computeBallisticSolution('9mm_para', { maxRangeM: 300 });
    const sol556 = computeBallisticSolution('556_nato', { maxRangeM: 600 });
    const sol50 = computeBallisticSolution('50_bmg', { maxRangeM: 1000 });

    const traj9 = buildRangeTrajectory3D(sol9, 100, 'dope_dial');
    const traj556At100 = buildRangeTrajectory3D(sol556, 100, 'dope_dial');
    const traj50 = buildRangeTrajectory3D(sol50, 600, 'dope_dial');

    expect(traj50.steelImpact.acousticReturnDelayS).toBeCloseTo(600 / 343, 5);
    expect(traj50.steelImpact.totalAudioCueDelayS).toBeCloseTo(
      traj50.totalFlightTimeS + 600 / 343,
      5
    );

    // Momentum impulse & swing peak scale physically with caliber power
    expect(traj50.steelImpact.impactMomentumNs).toBeGreaterThan(
      traj556At100.steelImpact.impactMomentumNs * 4
    );
    expect(traj50.steelImpact.swingPeakAngleRad).toBeGreaterThan(
      traj556At100.steelImpact.swingPeakAngleRad
    );
    expect(traj556At100.steelImpact.swingPeakAngleRad).toBeGreaterThan(
      traj9.steelImpact.swingPeakAngleRad
    );

    // Pendulum swing starts at 0, peaks quickly after impact, and damps smoothly
    expect(evaluateSteelPendulumAngle(traj50.steelImpact, 0)).toBe(0);
    expect(evaluateSteelPendulumAngle(traj50.steelImpact, -0.1)).toBe(0);
    const swingPeak = evaluateSteelPendulumAngle(traj50.steelImpact, 0.35);
    const swingLate = Math.abs(
      evaluateSteelPendulumAngle(traj50.steelImpact, 4.5)
    );
    expect(swingPeak).toBeGreaterThan(0.2);
    expect(swingLate).toBeLessThan(swingPeak * 0.25);
  });

  it('models 10% FBI ballistic gel penetration depth, hydrodynamic stretch cavity, and elastic rebound pulse', () => {
    const sol9 = computeBallisticSolution('9mm_para', { maxRangeM: 100 });
    const sol50 = computeBallisticSolution('50_bmg', { maxRangeM: 1000 });
    const solArrow = computeBallisticSolution('arrow_400gr', { maxRangeM: 100 });

    const gel9 = evaluateBallisticGelCavity(
      sol9.spec,
      interpolateTrajectoryAt(sol9, 50)!,
      true
    );
    const gel50 = evaluateBallisticGelCavity(
      sol50.spec,
      interpolateTrajectoryAt(sol50, 500)!,
      true
    );
    const gelArrow = evaluateBallisticGelCavity(
      solArrow.spec,
      interpolateTrajectoryAt(solArrow, 40)!,
      true
    );
    const gelMiss = evaluateBallisticGelCavity(
      sol9.spec,
      interpolateTrajectoryAt(sol9, 50)!,
      false
    );

    expect(gelMiss.hit).toBe(false);
    expect(gelMiss.penetrationDepthCm).toBe(0);

    expect(gel9.hit).toBe(true);
    expect(gel9.penetrationDepthCm).toBeGreaterThan(20);
    expect(gel9.penetrationDepthCm).toBeLessThanOrEqual(GEL_BLOCK_LENGTH_CM);

    // .50 BMG passes cleanly through 52 cm gel block with large temporary stretch cavity
    expect(gel50.passesThrough).toBe(true);
    expect(gel50.penetrationDepthCm).toBe(GEL_BLOCK_LENGTH_CM);
    expect(gel50.tempStretchRadiusCm).toBeGreaterThan(gel9.tempStretchRadiusCm * 1.4);

    // Broadhead arrow slices deeply with tiny hydrostatic temporary cavity vs rifle/magnum rounds
    expect(gelArrow.penetrationDepthCm).toBeGreaterThan(20);
    expect(gelArrow.tempStretchRadiusCm).toBeLessThan(gel9.tempStretchRadiusCm);

    // Temporary cavity pulse starts at 0, peaks quickly around ~8-12ms, then rebounds lower
    expect(evaluateGelCavityPulse01(gel50, 0)).toBe(0);
    const pPeak = evaluateGelCavityPulse01(gel50, 0.01);
    const pSettled = evaluateGelCavityPulse01(gel50, 0.3);
    expect(pPeak).toBeGreaterThan(0.65);
    expect(pSettled).toBeLessThan(pPeak);
    expect(pSettled).toBeGreaterThan(0.15);
  });

  it('reacts wind flags live to wind speed & clock direction and frames all 3 camera modes cleanly', () => {
    const calmFlags = computeWindFlagStates(1000, 0);
    const galeRight = computeWindFlagStates(1000, 12);
    const galeLeft = computeWindFlagStates(1000, -12);

    expect(calmFlags.map((f) => f.rangeM)).toEqual([...RANGE_YARDAGE_MARKERS_M]);
    expect(galeRight[0].yawRad).toBe(0);
    expect(galeLeft[0].yawRad).toBeCloseTo(Math.PI, 6);
    // Stronger wind lifts flag toward horizontal (smaller droop) and increases flutter speed & amplitude
    expect(galeRight[0].droopRad).toBeLessThan(calmFlags[0].droopRad * 0.25);
    expect(galeRight[0].flutterHz).toBeGreaterThan(calmFlags[0].flutterHz * 8);
    expect(galeRight[0].flutterAmpRad).toBeGreaterThan(
      calmFlags[0].flutterAmpRad * 5
    );

    // Flag cloth attachment at pole (u = 0) stays anchored at 0
    expect(evaluateWindFlagFlutterOffset(galeRight[0], 0, 1.2)).toBe(0);
    expect(
      Math.abs(evaluateWindFlagFlutterOffset(galeRight[0], 1, 0.37))
    ).toBeGreaterThan(0);

    // Verify all 3 camera modes produce valid, ground-cleared poses
    const sol = computeBallisticSolution('338_lapua', { maxRangeM: 1000 });
    const traj = buildRangeTrajectory3D(sol, 600, 'dope_dial', 'steel_gong');
    const midPose = sampleProjectilePoseAtTime(traj, traj.totalFlightTimeS * 0.5);
    const camOut = createMutableCameraPose3D();

    expect(RANGE_CAMERA_MODES).toEqual([
      'overview',
      'bullet_cam',
      'spotter_flir',
    ]);
    expect(RANGE_SPEED_OPTIONS).toEqual([0.05, 0.2, 1.0]);
    expect(RANGE_TARGET_TYPES).toEqual(['steel_gong', 'ballistic_gel']);
    expect(RANGE_AIM_MODES).toEqual(['dope_dial', 'elev_only', 'raw_zero']);

    for (const mode of RANGE_CAMERA_MODES) {
      const res = evaluateRangeCameraPoseInto(mode, traj, midPose, camOut);
      expect(res).toBe(camOut);
      expect(Number.isFinite(res.posX)).toBe(true);
      expect(Number.isFinite(res.posY)).toBe(true);
      expect(Number.isFinite(res.posZ)).toBe(true);
      expect(res.posY).toBeGreaterThan(0.3);
      expect(res.fovDeg).toBeGreaterThan(20);
      expect(res.fovDeg).toBeLessThan(70);
    }

    // Bullet-Cam chases right behind the mid-flight projectile
    evaluateRangeCameraPoseInto('bullet_cam', traj, midPose, camOut);
    expect(Math.abs(camOut.posX - midPose.x)).toBeLessThan(3);

    // Spotter/FLIR camera sits downrange near the target
    evaluateRangeCameraPoseInto('spotter_flir', traj, midPose, camOut);
    expect(Math.abs(camOut.posX - traj.targetCenterX)).toBeLessThan(15);
  });

  it('maintains 100% zh/en bilingual parity with 0 CJK in English and clean SSR rendering of Range3DScene & ExternalBallisticsView', () => {
    const en = EXTERNAL_BALLISTICS_STRINGS.en;
    const zh = EXTERNAL_BALLISTICS_STRINGS.zh;
    expect(Object.keys(en)).toEqual(Object.keys(zh));

    const range3dEnStrings = [
      en.workspaceModeAria,
      en.workspaceModeSplit,
      en.workspaceModeRange3d,
      en.workspaceModeCharts2d,
      en.range3dJumpBtn,
      en.range3dJumpTitle,
      en.range3dBadge,
      en.range3dTitle,
      en.range3dSubtitle('.338 LM', 600, '1.75'),
      en.range3dCamGroupAria,
      en.range3dCameraLabels.overview,
      en.range3dCameraLabels.bullet_cam,
      en.range3dCameraLabels.spotter_flir,
      en.range3dFlirBtn,
      en.range3dFlirTitle,
      en.range3dAudioTitle,
      en.range3dAudioOn,
      en.range3dAudioMuted,
      en.range3dFireBtn,
      en.range3dPlayBtn,
      en.range3dPauseBtn,
      en.range3dResetBtn,
      en.range3dSpeedLabel,
      en.range3dTimelineLabel,
      en.range3dTargetTypeLabel,
      en.range3dTargetLabels.steel_gong,
      en.range3dTargetLabels.ballistic_gel,
      en.range3dAimModeLabel,
      en.range3dAimLabels.dope_dial,
      en.range3dAimLabels.elev_only,
      en.range3dAimLabels.raw_zero,
      en.range3dHudRange,
      en.range3dHudVelMach,
      en.range3dHudTof,
      en.range3dHudEnergy,
      en.range3dHudDropWind,
      en.range3dHudStatus,
      en.range3dAcousticLabel,
      en.range3dHitStatus('bullseye'),
      en.range3dHitStatus('plate'),
      en.range3dHitStatus('edge'),
      en.range3dMissStatus,
      en.range3dGelImpactStatus('42.5', false),
      en.range3dGelImpactStatus('52.0', true),
      en.range3dTermImpactVel,
      en.range3dTermTof,
      en.range3dTermGongResult,
      en.range3dTermSwing,
      en.range3dTermGelDepth,
      en.range3dTermGelCavity,
    ];

    for (const str of range3dEnStrings) {
      expect(str.length).toBeGreaterThan(0);
      expect(CJK_RE.test(str)).toBe(false);
    }

    const sol = computeBallisticSolution('338_lapua', { maxRangeM: 1000 });
    const htmlRangeEn = renderToStaticMarkup(
      React.createElement(Range3DScene, {
        focusedSolution: sol,
        comparisonSolutions: [sol],
        slotColors: ['#38bdf8'],
        maxRangeM: 1000,
        targetRangeM: 600,
        signedCrosswindMps: 4.5,
        lang: 'en',
        isLightTheme: false,
      })
    );
    expect(htmlRangeEn).toContain('3D 1,000m Interactive Firing Range');
    expect(htmlRangeEn).toContain('Bullet-Cam');
    expect(htmlRangeEn).toContain('Spotter / FLIR');
    expect(htmlRangeEn).toContain('0.05x');
    expect(htmlRangeEn).toContain('AR500 Steel Gong');
    expect(htmlRangeEn).toContain('Ballistic Gel Block');
    expect(htmlRangeEn).toContain('FIRE');
    expect(CJK_RE.test(htmlRangeEn)).toBe(false);

    const htmlRangeZh = renderToStaticMarkup(
      React.createElement(Range3DScene, {
        focusedSolution: sol,
        comparisonSolutions: [sol],
        slotColors: ['#38bdf8'],
        maxRangeM: 1000,
        targetRangeM: 600,
        signedCrosswindMps: 4.5,
        lang: 'zh',
        isLightTheme: false,
      })
    );
    expect(htmlRangeZh).toContain('3D 1,000m 交互式实弹靶场与慢动作子弹时间追踪');
    expect(htmlRangeZh).toContain('子弹追踪视角');
    expect(htmlRangeZh).toContain('AR500 钢靶');
    expect(htmlRangeZh).toContain('弹道明胶块');

    // Full ExternalBallisticsView integration SSR check
    const prevLang = useAppStore.getState().lang;
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en' });
      const fullHtmlEn = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '50_bmg',
        })
      );
      expect(fullHtmlEn).toContain('range-3d-section');
      expect(fullHtmlEn).toContain('3D Range / Bullet-Cam');
      expect(fullHtmlEn).toContain('3D Range + 2D Lab');
      const stripped = fullHtmlEn.replace(/中文/g, '');
      expect(CJK_RE.test(stripped)).toBe(false);
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }
  });
});

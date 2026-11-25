import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderComposerWithTelemetry,
} from '../src/engine/canvas/ArmoryPostProcessing';
import {
  computePortraitPhoneDistanceMultiplier,
  computeWorkbenchSectionBarOffsetY,
  PORTRAIT_PHONE_DISTANCE_MULT,
  TALL_GRIP_FIRING_CT_EXTRA_CLEARANCE_CM,
} from '../src/engine/canvas/ArmoryViewport';
import {
  getGpuTelemetrySnapshot,
  resetGpuTelemetryBus,
  setGpuTelemetryEnabled,
} from '../src/engine/canvas/gpuTelemetryBus';
import { evaluateArmorPenetration } from '../src/engine/physics/armorPenetration';
import {
  computeTankGunnerCameraPose,
  TANK_CREW_SPECS,
  type TankWeaponId,
} from '../src/engine/tank/tankCrewStore';
import {
  ArmoryView,
  resolveArmoryHeaderDesktopTitle,
} from '../src/features/armory/ArmoryView';
import {
  ARMOR_SPRITE_SCALE_Y,
  ARMOR_THEATER_CAMERA_DISTANCE_MULT,
  computeArmorLayerSpriteLayout,
  computeArmorTheaterCameraPose,
} from '../src/features/armorlab/ArmorPenetration3DScene';
import { buildArmorTheaterLayout } from '../src/features/armorlab/armorPenetration3DMath';
import { ARMOR_PENETRATION_STRINGS } from '../src/features/armorlab/armorPenetrationStrings';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { SplitShowdownOverlay } from '../src/features/showdown3d/SplitShowdownOverlay';
import { LiveSectionPlaneBar } from '../src/features/workbench/LiveSectionPlaneBar';
import { PartInspectorCard } from '../src/features/workbench/PartInspectorCard';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function collectStrings(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === 'string') {
    out.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, out);
  } else if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      collectStrings(val, out);
    }
  }
  return out;
}

describe('Cycle 6C (9.55 -> 9.85 / 10): Pinpoint Telemetry, Optics, 3D Framing, Mobile UX & EN Parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetGpuTelemetryBus();
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      mode: 'explode',
      sectionCut: false,
      selectedPartId: null,
      lang: 'zh',
    });
  });

  it('1. ArmoryPostProcessing renderComposerWithTelemetry captures real multi-pass calls/triangles and always restores autoReset', () => {
    resetGpuTelemetryBus();

    const makeMockGl = () => {
      const renderInfo = { calls: 0, triangles: 0 };
      const info = {
        autoReset: true,
        render: renderInfo,
        memory: { geometries: 42, textures: 18 },
        programs: [{}, {}, {}, {}, {}],
        reset: vi.fn(() => {
          renderInfo.calls = 0;
          renderInfo.triangles = 0;
        }),
      };
      return {
        gl: { info } as unknown as Parameters<
          typeof renderComposerWithTelemetry
        >[1],
        info,
      };
    };

    // Disabled path: zero reset, keeps autoReset=true, still renders composer
    {
      const { gl, info } = makeMockGl();
      info.autoReset = false;
      const composer = {
        render: vi.fn(() => {
          info.render.calls = 1;
          info.render.triangles = 1;
        }),
      };
      const published = renderComposerWithTelemetry(composer, gl, 1 / 60);
      expect(published).toBe(false);
      expect(info.reset).not.toHaveBeenCalled();
      expect(info.autoReset).toBe(true);
      expect(composer.render).toHaveBeenCalledTimes(1);
    }

    // Enabled path: simulates RenderPass (74 calls / 145,196 tris) + GTAOPass + Bloom + OutputPass (4 calls / 4 tris)
    {
      setGpuTelemetryEnabled(true);
      const { gl, info } = makeMockGl();
      let autoResetDuringRender = true;
      const composer = {
        render: vi.fn(() => {
          autoResetDuringRender = info.autoReset;
          // Main scene RenderPass
          if (info.autoReset) info.reset();
          info.render.calls += 74;
          info.render.triangles += 145_196;
          // Final fullscreen OutputPass (would clobber to 1/1 if autoReset remained true)
          if (info.autoReset) info.reset();
          info.render.calls += 4;
          info.render.triangles += 4;
        }),
      };

      const published = renderComposerWithTelemetry(composer, gl, 0.016);
      expect(published).toBe(true);
      expect(autoResetDuringRender).toBe(false);
      expect(info.reset).toHaveBeenCalledTimes(1);
      expect(info.autoReset).toBe(true);

      const snap = getGpuTelemetrySnapshot();
      expect(snap.drawCalls).toBe(78);
      expect(snap.triangles).toBe(145_200);
      expect(snap.geometries).toBe(42);
      expect(snap.textures).toBe(18);
      expect(snap.programs).toBe(5);
    }

    // Exception safety: restores gl.info.autoReset = true even if composer.render throws
    {
      setGpuTelemetryEnabled(true);
      const { gl, info } = makeMockGl();
      const failingComposer = {
        render: vi.fn(() => {
          throw new Error('simulated WebGL pass error');
        }),
      };
      expect(() =>
        renderComposerWithTelemetry(failingComposer, gl, 0.016)
      ).toThrow('simulated WebGL pass error');
      expect(info.autoReset).toBe(true);
    }
  });

  it('2. M1A2 Abrams Gunner optic clears m1a2_crows_optics and Tiger 131 HUD floats above Zeiss reticle overlay', () => {
    // M1A2 m1a2_crows_optics spans X=[-26, 133], Y=[76, 124], Z=[-86, 83]
    const pose0 = computeTankGunnerCameraPose('m1a2', 0);
    expect(pose0).not.toBeNull();
    if (!pose0) throw new Error('expected m1a2 pose');
    const [ex, ey] = pose0.eye;
    const [tx, ty] = pose0.target;
    expect(ey).toBeGreaterThanOrEqual(150);
    // Interpolate ray Y at X = 133 (front edge of m1a2_crows_optics)
    const tAtFront = (133 - ex) / (tx - ex);
    expect(tAtFront).toBeGreaterThan(0);
    expect(tAtFront).toBeLessThan(1);
    const rayYAtFront = ey + (ty - ey) * tAtFront;
    expect(rayYAtFront).toBeGreaterThan(124);

    // Verify all 4 MBTs produce finite rotated poses at yaw = 0° and yaw = 35°
    const tanks: TankWeaponId[] = ['ztz99a', 'm1a2', 'leopard2a7', 'tiger1'];
    for (const id of tanks) {
      expect(TANK_CREW_SPECS[id].gunnerEyeOffset).toHaveLength(3);
      for (const yaw of [0, 35]) {
        const pose = computeTankGunnerCameraPose(id, yaw);
        expect(pose).not.toBeNull();
        expect(pose?.eye.every(Number.isFinite)).toBe(true);
        expect(pose?.target.every(Number.isFinite)).toBe(true);
      }
    }

    // Tiger 131 HUD z-index must sit strictly above .tank-gunner-reticle-overlay (z-index: 2)
    const tankCrewCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/tank-crew.css'),
      'utf8'
    );
    const hudBlock = tankCrewCss.match(/\.tank-crew-hud\s*\{([^}]*)\}/);
    const reticleBlock = tankCrewCss.match(
      /\.tank-gunner-reticle-overlay\s*\{([^}]*)\}/
    );
    expect(hudBlock).not.toBeNull();
    expect(reticleBlock).not.toBeNull();
    const hudZ = Number(hudBlock?.[1].match(/z-index:\s*(\d+)/)?.[1] ?? 0);
    const reticleZ = Number(
      reticleBlock?.[1].match(/z-index:\s*(\d+)/)?.[1] ?? 0
    );
    expect(hudZ).toBeGreaterThan(reticleZ);
  });

  it('3. 3D Armor Penetration Theater staggers layer sprites, pulls camera back ~8.5%, and keeps mobile tabs single-line', () => {
    const even0 = computeArmorLayerSpriteLayout(0);
    const odd1 = computeArmorLayerSpriteLayout(1);
    const even2 = computeArmorLayerSpriteLayout(2);

    expect(even0.tier).toBe(0);
    expect(odd1.tier).toBe(1);
    expect(even2.tier).toBe(0);
    expect(odd1.spriteOffsetYCm - even0.spriteOffsetYCm).toBeGreaterThan(
      ARMOR_SPRITE_SCALE_Y
    );
    expect(even0.spriteOffsetXCm).toBeLessThan(0);
    expect(odd1.spriteOffsetXCm).toBeGreaterThan(0);

    const penRes = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'upper_glacis',
      rangeM: 1500,
      obliquityDeg: 0,
      eraEnabled: true,
    });
    const layout = buildArmorTheaterLayout(penRes);
    const pose = computeArmorTheaterCameraPose(layout);
    const expectedDist =
      layout.recommendedCameraDistanceCm * ARMOR_THEATER_CAMERA_DISTANCE_MULT;
    expect(ARMOR_THEATER_CAMERA_DISTANCE_MULT).toBeGreaterThanOrEqual(1.08);
    expect(pose.target[1]).toBeCloseTo(layout.recommendedTargetYCm + 2.5, 5);
    expect(pose.position[2]).toBeCloseTo(expectedDist * 0.96, 5);

    // Concise non-wrapping tabs & 0 CJK in EN
    expect(ARMOR_PENETRATION_STRINGS.zh.viewModes.theater3d).toBe('3D 剧场');
    expect(ARMOR_PENETRATION_STRINGS.zh.viewModes.schematic2d).toBe('2D 剖图');
    expect(ARMOR_PENETRATION_STRINGS.zh.viewModes.split).toBe('双屏');
    expect(ARMOR_PENETRATION_STRINGS.en.viewModes.theater3d).toBe('3D Theater');
    for (const s of collectStrings(ARMOR_PENETRATION_STRINGS.en)) {
      expect(CJK_RE.test(s)).toBe(false);
    }

    const armorCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armor-penetration.css'),
      'utf8'
    );
    expect(armorCss).toMatch(/\.armor-view-tab\s*\{[\s\S]*?white-space:\s*nowrap/);
    expect(armorCss).toContain('@media (max-width: 640px)');
  });

  it('4. Live CT single-row desktop & collapsible mobile presets, non-overlapping 2-line mobile firing card, and portrait/tall-grip camera framing', async () => {
    await loadWeaponPlugin('p08');

    // Tall-grip pistol gets extra +1.0 cm CT clearance when mode === 'firing' && sectionCut
    const explodeLift = computeWorkbenchSectionBarOffsetY(
      'pistol',
      'right',
      true,
      'p08',
      false
    );
    const firingLift = computeWorkbenchSectionBarOffsetY(
      'pistol',
      'right',
      true,
      'p08',
      true
    );
    expect(explodeLift - firingLift).toBeCloseTo(
      TALL_GRIP_FIRING_CT_EXTRA_CLEARANCE_CM,
      5
    );

    // Portrait phone (+12%) vs desktop (1.0x) framing multiplier
    expect(computePortraitPhoneDistanceMultiplier(390 / 844)).toBe(
      PORTRAIT_PHONE_DISTANCE_MULT
    );
    expect(computePortraitPhoneDistanceMultiplier(1440 / 900)).toBe(1.0);

    // SSR markup checks for collapsible mobile CT toggle & mobile firing card toggle
    const ctHtml = renderToStaticMarkup(
      React.createElement(LiveSectionPlaneBar, {
        forceVisible: true,
        weaponIdOverride: 'p08',
        axisOverride: 'z',
      })
    );
    expect(ctHtml).toContain('data-testid="live-section-presets-toggle"');
    expect(ctHtml).toContain('live-section-presets-toggle');

    const inspectorHtml = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'p08',
        partIdOverride: null,
        modeOverride: 'firing',
      })
    );
    expect(inspectorHtml).toContain('firing-compact-head');
    expect(inspectorHtml).toContain('data-testid="firing-card-mobile-toggle"');

    // Responsive CSS contracts: wide desktop single-row CT bar + mobile non-overlapping stack
    const responsiveCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/responsive.css'),
      'utf8'
    );
    expect(responsiveCss).toContain('@media (min-width: 1440px)');
    expect(responsiveCss).toMatch(
      /\.live-section-bar\.has-presets:not\(\.is-story-open\)\s*\{[\s\S]*?flex-direction:\s*row[\s\S]*?border-radius:\s*999px/
    );
    expect(responsiveCss).toContain('.live-section-presets-toggle');
    expect(responsiveCss).toMatch(
      /\.ballistics-telemetry-slot\.sidebar-collapsed\s*\{[\s\S]*?top:\s*calc\(var\(--hud-top-offset,\s*66px\)\s*\+\s*40px\)/
    );
    expect(responsiveCss).toMatch(
      /\.inspector-card\.firing-compact-card\s*\{[\s\S]*?top:\s*calc\(var\(--hud-top-offset,\s*66px\)\s*\+\s*84px\)/
    );
    expect(responsiveCss).toContain('-webkit-line-clamp: 1');
  });

  it('5. Split Showdown renders compact 2-line mobile plaques (<= 54px) with actions hidden on phones', () => {
    useAppStore.setState({
      screen: 'split_showdown',
      splitShowdownWeaponA: 'gau8',
      splitShowdownWeaponB: 'm134',
      lang: 'zh',
    });
    const html = renderToStaticMarkup(React.createElement(SplitShowdownOverlay));
    expect(html.match(/class="split-plaque-head"/g)?.length).toBe(2);
    expect(html.match(/class="split-plaque-actions"/g)?.length).toBe(2);

    const splitUpgradeCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/split-showdown-upgrade.css'),
      'utf8'
    );
    expect(splitUpgradeCss).toMatch(
      /\.split-plaque\s*\{[\s\S]*?max-height:\s*54px/
    );
    expect(splitUpgradeCss).toContain('.split-plaque-actions');
    expect(splitUpgradeCss).toContain('.split-plaque-head');
  });

  it('6. EN Armory wordmark avoids duplicate badge truncation, rack counter stays single-line, Ballistics & Showcase EN copy stay crisp with 0 CJK', () => {
    expect(resolveArmoryHeaderDesktopTitle('en', 'Digital Armory 3D')).toBe(
      '3D Vault'
    );
    expect(resolveArmoryHeaderDesktopTitle('zh', '3D 数字兵器库')).toBe(
      '3D 数字兵器库'
    );

    const armoryHtml = renderToStaticMarkup(React.createElement(ArmoryView));
    expect(armoryHtml).toContain('armory-title-desktop');
    expect(armoryHtml).toContain('rack-count-pill armory-rack-counter');
    const armorySrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/ArmoryView.tsx'),
      'utf8'
    );
    expect(armorySrc).toContain(
      'resolveArmoryHeaderDesktopTitle(lang, ui.title)'
    );

    const armoryCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armory.css'),
      'utf8'
    );
    expect(armoryCss).toMatch(
      /\.rack-count-pill,\s*\.armory-rack-counter\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?flex-shrink:\s*0/
    );

    // EN Ballistics single-row desktop header title + full zh/en key parity + 0 CJK
    expect(EXTERNAL_BALLISTICS_STRINGS.en.title).toBe(
      '1,000m External Ballistics & 3D Range'
    );
    expect(Object.keys(EXTERNAL_BALLISTICS_STRINGS.en)).toEqual(
      Object.keys(EXTERNAL_BALLISTICS_STRINGS.zh)
    );
    for (const s of collectStrings(EXTERNAL_BALLISTICS_STRINGS.en)) {
      expect(CJK_RE.test(s)).toBe(false);
    }

    // EN Showcase 2-line keynote hero preserving 100 / 2174 / 453 / 1980 & 0 CJK
    const enHero = SHOWCASE_STRINGS.en.hero;
    const fullH1 = `${enHero.titlePrefix}${enHero.titleHighlight}${enHero.titleSuffix}`;
    expect(fullH1.length).toBeLessThanOrEqual(70);
    expect(fullH1).toContain('100');
    const subCombined = `${enHero.subLead}${enHero.subPartsStrong}${enHero.subMid1}${enHero.subMapsStrong}${enHero.subMid2}${enHero.subAudioStrong}${enHero.subTail}`;
    expect(subCombined.length).toBeLessThan(140);
    expect(subCombined).toContain('2174');
    expect(subCombined).toContain('453');
    expect(subCombined).toContain('1980');
    for (const s of collectStrings(enHero)) {
      expect(CJK_RE.test(s)).toBe(false);
    }
  });
});

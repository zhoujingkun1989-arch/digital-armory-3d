import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  computeMountedOpticClearanceBox,
  resolveCalloutHemisphere,
  untangleHemisphereLeaders,
} from '../src/engine/callout/CalloutOverlay';
import { computeWorkbenchSectionBarOffsetY } from '../src/engine/canvas/ArmoryViewport';
import {
  ARMOR_TARGET_TANK_IDS,
  ARMOR_ZONE_IDS,
  evaluateArmorPenetration,
} from '../src/engine/physics/armorPenetration';
import { buildArmorTheaterLayout } from '../src/features/armorlab/armorPenetration3DMath';
import { formatArmorLayerBadgeTag } from '../src/features/armorlab/ArmorPenetration3DScene';
import { ArmorPenetrationModal } from '../src/features/armorlab/ArmorPenetrationModal';
import { ARMOR_PENETRATION_STRINGS } from '../src/features/armorlab/armorPenetrationStrings';
import {
  ArmoryView,
  resolveArmoryPlaqueStrings,
} from '../src/features/armory/ArmoryView';
import AttachmentBenchPanel from '../src/features/workbench/AttachmentBenchPanel';
import { WorkbenchHeader } from '../src/features/workbench/WorkbenchHeader';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';

const ROOT = process.cwd();
const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

describe('Cycle 2C — Luxury Responsive UX, Tank/Ordnance Plaques, Smart Callouts & 3D Armor Theater', () => {
  it('provides authentic bilingual tankPlaque & ordnancePlaque labels with 0 CJK in EN', () => {
    const zhArmory = UI_STRINGS.zh.armory;
    const enArmory = UI_STRINGS.en.armory;

    // 1. Key parity & 0 CJK in English
    for (const groupKey of ['tankPlaque', 'ordnancePlaque'] as const) {
      const zhKeys = Object.keys(zhArmory[groupKey]).sort();
      const enKeys = Object.keys(enArmory[groupKey]).sort();
      expect(zhKeys).toEqual(enKeys);

      for (const [k, val] of Object.entries(enArmory[groupKey])) {
        const rendered =
          typeof val === 'function' ? val('ZTZ-99A') : String(val);
        expect(rendered.trim().length, `${groupKey}.${k} empty`).toBeGreaterThan(
          0
        );
        expect(
          CJK_REGEX.test(rendered),
          `CJK leak in en.armory.${groupKey}.${k}`
        ).toBe(false);
      }
    }

    // 2. Domain-authentic terminology for MBTs & GAU-8/A (never small-arms "全枪长 / 空枪质量")
    expect(zhArmory.tankPlaque.oalLabel).toBe('全车长');
    expect(zhArmory.tankPlaque.weightLabel).toBe('战斗全重');
    expect(zhArmory.tankPlaque.barrelLabel).toBe('主炮与身管');
    expect(zhArmory.tankPlaque.muzzleVelLabel).toBe('炮口初速');
    expect(enArmory.tankPlaque.weightLabel).toBe('Combat Weight');
    expect(enArmory.tankPlaque.barrelLabel).toBe('Main Cannon');

    expect(zhArmory.ordnancePlaque.oalLabel).toBe('系统全长');
    expect(zhArmory.ordnancePlaque.weightLabel).toBe('满载质量');
    expect(zhArmory.ordnancePlaque.barrelLabel).toBe('七管旋转炮管');
    expect(enArmory.ordnancePlaque.oalLabel).toBe('System Length');
    expect(enArmory.ordnancePlaque.barrelLabel).toBe('7-Barrel Cluster');

    // 3. Domain routing across exhibits
    expect(resolveArmoryPlaqueStrings('ztz99a', 'armor', zhArmory)).toBe(
      zhArmory.tankPlaque
    );
    expect(resolveArmoryPlaqueStrings('tiger1', 'armor', enArmory)).toBe(
      enArmory.tankPlaque
    );
    expect(resolveArmoryPlaqueStrings('gau8', 'ordnance', zhArmory)).toBe(
      zhArmory.ordnancePlaque
    );
    expect(resolveArmoryPlaqueStrings('lift33', 'archery', zhArmory)).toBe(
      zhArmory.archeryPlaque
    );
    expect(resolveArmoryPlaqueStrings('ak15', 'rifle', zhArmory)).toBe(
      zhArmory
    );
  });

  it('consolidates Armory header to <= 8 desktop controls, adds mobile drawer, rack fade & hides mobile watermark', () => {
    const html = renderToStaticMarkup(React.createElement(ArmoryView));

    // Consolidated desktop header landmarks
    expect(html).toContain('class="armory-halls-strip"');
    expect(html).toContain('class="armory-header-controls"');
    expect(html).toContain('armory-labs-popover-panel');
    expect(html).toContain('armory-display-popover-panel');
    expect(html).toContain('armory-mobile-menu-btn');
    expect(html).toContain('armory-quick-enter-btn');
    // Quiet bay spec pill + hover/active action cue in rack cards
    expect(html).toContain('wcard-spec-tag');
    expect(html).toContain('wcard-enter-cue');

    // Verify top-level desktop header control count inside .armory-header-controls is <= 6 (+ brand + hall strip = <= 8)
    const controlsMatch = html.match(
      /<div class="armory-header-controls">([\s\S]*?)<\/header>/
    );
    expect(controlsMatch).not.toBeNull();
    const topLevelTriggerCount =
      (controlsMatch![1].match(/<button\b/g) ?? []).length;
    // Cmd+K + Labs + Display + Lang(2 segs) + MobileMenu + Inspect = 7 buttons max inside controls
    expect(topLevelTriggerCount).toBeLessThanOrEqual(7);

    // Verify CSS rules for single-row desktop header, right-edge fade mask, mobile header <= 58px & watermark hidden < 768px
    const armoryCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armory.css'),
      'utf8'
    );
    const responsiveCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/responsive.css'),
      'utf8'
    );
    expect(armoryCss).toContain('mask-image: linear-gradient');
    expect(armoryCss).toContain('.armory-mobile-drawer');
    expect(armoryCss).not.toContain('.schematic-watermark');
    expect(responsiveCss).toMatch(
      /@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.schematic-watermark\s*\{[\s\S]*?display:\s*none/
    );
    expect(responsiveCss).toContain('.armory-header .armory-mobile-menu-btn');
    expect(responsiveCss).toContain(
      '.top-bar:not(.is-mobile-expanded) .toolbar-cluster-tools'
    );
  });

  it('fixes Workbench visual hierarchy, single-line Attachment Bench heading & P08 CT-bar camera lift', () => {
    const wbHtml = renderToStaticMarkup(React.createElement(WorkbenchHeader));

    // Monograph & Mech SFX demoted to neutral ghost chips (never loud amber/cyan at rest)
    expect(wbHtml).not.toContain('toggle-chip active-amber');
    expect(wbHtml).toContain('toggle-chip wb-ghost-chip');
    // Section Cut & Labs elevated with museum accents
    expect(wbHtml).toContain('wb-accent-cutaway');
    expect(wbHtml).toContain('wb-accent-labs');
    // Compact mobile quick controls present
    expect(wbHtml).toContain('wb-mobile-actions');

    // Attachment Bench heading fits on a single line (no orphan wrap)
    const attHtml = renderToStaticMarkup(
      React.createElement(AttachmentBenchPanel)
    );
    expect(attHtml).toContain('模块化改装台 ·');
    expect(UI_STRINGS.en.attachmentBench.title).toBe('Attachment Bench');
    const attCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/attachment-bench.css'),
      'utf8'
    );
    expect(attCss).toMatch(/\.att-title\s*\{[\s\S]*?white-space:\s*nowrap/);

    // Scale-aware vertical framing lift when sectionCut (.live-section-bar) is active
    expect(computeWorkbenchSectionBarOffsetY('pistol', 'iso', false)).toBe(0);
    expect(computeWorkbenchSectionBarOffsetY('pistol', 'top', true)).toBe(0);
    expect(
      computeWorkbenchSectionBarOffsetY('pistol', 'armory_showcase', true)
    ).toBe(0);

    const pistolFiringLift = computeWorkbenchSectionBarOffsetY(
      'pistol',
      'firing_view',
      true
    );
    const pistolIsoLift = computeWorkbenchSectionBarOffsetY(
      'pistol',
      'iso',
      true
    );
    const rifleLift = computeWorkbenchSectionBarOffsetY('rifle', 'iso', true);
    const tankLift = computeWorkbenchSectionBarOffsetY(
      'main_battle_tank',
      'iso',
      true
    );

    // Negative target/camera Y shift moves the 3D pistol/weapon UP above `.live-section-bar`
    expect(pistolFiringLift).toBeLessThan(-1.2);
    expect(pistolIsoLift).toBeLessThan(-1.8);
    expect(rifleLift).toBeLessThan(pistolIsoLift);
    expect(tankLift).toBeLessThan(-20);
  });

  it('defaults showLabels to false at t=0, routes callouts by hemisphere with 0 crossings & clears mounted optics', () => {
    // 1. Default showLabels === false at initial assembled state, [L] toggle functional
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().showLabels).toBe(false);
    useAppStore.getState().toggleShowLabels();
    expect(useAppStore.getState().showLabels).toBe(true);
    useAppStore.getState().toggleShowLabels();
    expect(useAppStore.getState().showLabels).toBe(false);

    // 2. Nearest-hemisphere routing: upper roof part (e.g. ZTZ-99A CITV) anchors UP even if preferredDir was 'down'
    const weaponMidY = 540;
    expect(
      resolveCalloutHemisphere(340, weaponMidY, 'down', 310, 680, 90, 900)
    ).toBe('up');
    // Lower part (grip/mag) anchors DOWN even if preferredDir was 'up'
    expect(
      resolveCalloutHemisphere(670, weaponMidY, 'up', 310, 690, 90, 900)
    ).toBe('down');
    // Respects screen top/bottom clearance limits when headroom is exhausted
    expect(
      resolveCalloutHemisphere(340, weaponMidY, 'up', 96, 680, 90, 900)
    ).toBe('down');

    // 3. Zero-GC crossing-minimization untangling in upper & lower hemispheres
    const anchorX = new Float64Array([300, 520, 740, 360, 640]);
    const anchorY = new Float64Array([400, 410, 395, 620, 630]);
    // Deliberately crossed label X positions in BOTH upper (0,1,2) and lower (3,4) hemispheres
    const lx = new Float64Array([710, 310, 500, 680, 320]);
    const ly = new Float64Array([240, 260, 240, 780, 780]);
    const halfW = new Float64Array([55, 55, 55, 55, 55]);
    const minX = new Float64Array([60, 60, 60, 60, 60]);
    const maxX = new Float64Array([1860, 1860, 1860, 1860, 1860]);

    untangleHemisphereLeaders(anchorX, anchorY, lx, ly, halfW, minX, maxX, 5);

    // Upper hemisphere: anchorX[0] < anchorX[1] < anchorX[2] => lx[0] < lx[1] < lx[2]
    expect(lx[0]).toBeLessThan(lx[1]);
    expect(lx[1]).toBeLessThan(lx[2]);
    // Lower hemisphere: anchorX[3] < anchorX[4] => lx[3] < lx[4]
    expect(lx[3]).toBeLessThan(lx[4]);

    // 4. Mounted optic vertical clearance box lifts upper-receiver callouts above LPVO/Thermal/RedDot
    expect(computeMountedOpticClearanceBox('m4a1', 'none')).toBeNull();
    const lpvoBox = computeMountedOpticClearanceBox('m4a1', 'lpvo');
    const thermalBox = computeMountedOpticClearanceBox('m4a1', 'thermal');
    expect(lpvoBox).not.toBeNull();
    expect(thermalBox).not.toBeNull();
    expect(lpvoBox![4] - lpvoBox![1]).toBeGreaterThan(2.5);
    expect(thermalBox![4] - thermalBox![1]).toBeGreaterThan(
      lpvoBox![4] - lpvoBox![1]
    );
  });

  it('removes WP-20 public badge, upgrades 3D Armor Theater textures/plasma/badges & fixes mobile ordering', () => {
    // 1. Zero internal WP-20 badge leak in zh/en + 0 CJK in EN
    expect(ARMOR_PENETRATION_STRINGS.zh.badge).not.toMatch(/WP-\d+/i);
    expect(ARMOR_PENETRATION_STRINGS.en.badge).not.toMatch(/WP-\d+/i);
    expect(ARMOR_PENETRATION_STRINGS.zh.badge).toBe('1:1 复合装甲穿甲剧场');
    expect(ARMOR_PENETRATION_STRINGS.en.badge).toBe(
      '1:1 ARMOR PENETRATION THEATER'
    );
    expect(CJK_REGEX.test(JSON.stringify(ARMOR_PENETRATION_STRINGS.en))).toBe(
      false
    );

    const modalHtml = renderToStaticMarkup(
      React.createElement(ArmorPenetrationModal, { onClose: () => {} })
    );
    expect(modalHtml).not.toMatch(/WP-20/i);
    expect(modalHtml).toContain('preserveAspectRatio="xMidYMid meet"');

    // 2. Crisp 3D cutaway layer stencil badge labels across MBT armor zones
    expect(
      formatArmorLayerBadgeTag({ kind: 'era', nameEn: 'FY-4 Heavy Dual-Plate ERA' })
    ).toBe('FY-4 ERA');
    expect(
      formatArmorLayerBadgeTag({ kind: 'ceramic_nera', nameEn: 'Chobham / NERA' })
    ).toBe('NERA');
    expect(
      formatArmorLayerBadgeTag({
        kind: 'du_composite',
        nameEn: 'Depleted Uranium NGAP Array',
      })
    ).toBe('DU · NGAP');
    expect(
      formatArmorLayerBadgeTag({ kind: 'rha_steel', nameEn: 'RHA Backing Plate' })
    ).toBe('RHA');

    for (const tankId of ARMOR_TARGET_TANK_IDS) {
      for (const zoneId of ARMOR_ZONE_IDS) {
        const res = evaluateArmorPenetration({
          projectileId: '125mm_apfsds',
          targetTankId: tankId,
          zoneId,
          rangeM: 1500,
          obliquityDeg: 15,
          eraEnabled: true,
        });
        const layout = buildArmorTheaterLayout(res);
        for (const layer of layout.layers) {
          const tag = formatArmorLayerBadgeTag(layer);
          expect(tag.length).toBeGreaterThan(0);
          expect(CJK_REGEX.test(tag)).toBe(false);
        }
      }
    }

    // 3. Procedural RHA/NERA/DU textures + badge disposal + clamped plasma flash (no whiteout)
    const sceneSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armorlab/ArmorPenetration3DScene.tsx'),
      'utf8'
    );
    expect(sceneSrc).toContain('createArmorSurfaceTextures');
    expect(sceneSrc).toContain('createArmorLayerBadgeTexture');
    expect(sceneSrc).toContain('lockLinearTextureColorSpace');
    expect(sceneSrc).toContain('armorTextures?.dispose()');
    expect(sceneSrc).toContain('badgeTex?.dispose()');
    expect(sceneSrc).toContain('ViewportErrorBoundary');
    expect(sceneSrc).not.toContain('color="#fff3c4"');
    expect(sceneSrc).not.toContain('color="#fffbeb"');

    // 4. Mobile Verdict+3D Theater first (`order: -1`) & compact curve fit inside 94vh
    const armorCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armor-penetration.css'),
      'utf8'
    );
    expect(armorCss).toMatch(
      /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.armor-pen-stage\s*\{[\s\S]*?order:\s*-1/
    );
    expect(armorCss).toContain('.armor-curve-svg');
    expect(armorCss).toContain('max-height: 154px');
  });
});

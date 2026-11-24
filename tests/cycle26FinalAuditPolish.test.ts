import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveArmorTheaterThemePalette } from '../src/features/armorlab/ArmorPenetration3DScene';
import {
  PORTRAIT_PHONE_ASSEMBLED_RIFLE_PULLBACK,
  PORTRAIT_PHONE_DISTANCE_MULT,
  computePortraitPhoneDistanceMultiplier,
} from '../src/engine/canvas/ArmoryViewport';

describe('Cycle 26C — Final Audit Pinpoint Polish (Daylight Armor Sprites & Mobile Portrait Assembled Pullback)', () => {
  it('gives Blueprint Daylight Armor 3D floating layer sprites crisp Prussian-slate borders, fog/toneMap immunity & unchanged Dark Studio', () => {
    const dark = resolveArmorTheaterThemePalette('tactical_vault');
    const day = resolveArmorTheaterThemePalette('blueprint_daylight');

    expect(dark.isDaylight).toBe(false);
    expect(dark.badgeBorderHex).toBeNull();
    expect(dark.badgeBgRgba).toBe('rgba(7, 13, 26, 0.92)');
    expect(dark.badgeTitleHex).toBe('#f8fafc');

    expect(day.isDaylight).toBe(true);
    expect(day.badgeBgRgba).toBe('rgba(248, 250, 252, 0.96)');
    expect(day.badgeBorderHex).toBe('#334155');
    expect(day.badgeTitleHex).toBe('#0f172a');
    expect(day.badgeMetaHex).toBe('#1d4ed8');

    // Verify SpriteMaterial disables fog & toneMapped so daylight fog never washes out floating layer labels
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/features/armorlab/ArmorPenetration3DScene.tsx'
      ),
      'utf8'
    );
    expect(src).toContain('ctx.strokeStyle = palette.badgeBorderHex ?? accentHex;');
    const spriteIdx = src.indexOf('new THREE.SpriteMaterial({');
    expect(spriteIdx).toBeGreaterThan(-1);
    const spriteBlock = src.slice(spriteIdx, spriteIdx + 260);
    expect(spriteBlock).toContain('fog: false');
    expect(spriteBlock).toContain('toneMapped: false');
  });

  it('adds default assembled portrait pull-back and horizontal centering for long rifles on 390x844 without altering desktop, tablet, compact or firing framing', () => {
    const phoneAspect = 390 / 844;
    expect(PORTRAIT_PHONE_ASSEMBLED_RIFLE_PULLBACK).toBeGreaterThanOrEqual(
      1.045
    );
    expect(PORTRAIT_PHONE_ASSEMBLED_RIFLE_PULLBACK).toBeLessThanOrEqual(1.1);

    const baseAk15 = computePortraitPhoneDistanceMultiplier(phoneAspect, 'ak15');
    const assembledAk15 = computePortraitPhoneDistanceMultiplier(
      phoneAspect,
      'ak15',
      true
    );
    expect(assembledAk15).toBeGreaterThan(baseAk15);
    expect(assembledAk15 / baseAk15).toBeCloseTo(
      PORTRAIT_PHONE_ASSEMBLED_RIFLE_PULLBACK,
      3
    );

    // Compact pistols & desktop/tablet remain strictly untouched
    expect(
      computePortraitPhoneDistanceMultiplier(phoneAspect, 'g17', true)
    ).toBe(PORTRAIT_PHONE_DISTANCE_MULT);
    expect(
      computePortraitPhoneDistanceMultiplier(1920 / 1080, 'ak15', true)
    ).toBe(1.0);
    expect(
      computePortraitPhoneDistanceMultiplier(1024 / 768, 'ak15', true)
    ).toBe(1.0);

    // Verify applyWorkbenchFraming passes assembled default flag cleanly
    const viewportSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/canvas/ArmoryViewport.tsx'),
      'utf8'
    );
    expect(viewportSrc).toContain(
      'const isAssembledDefault = !isFiringMode && !isFixedClosePreset && t < 0.05;'
    );
    expect(viewportSrc).toContain('isAssembledDefault');
  });
});

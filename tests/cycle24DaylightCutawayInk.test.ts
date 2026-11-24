import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  getSectionCapDaylightMode,
  getSectionCapMaterial,
  getSectionCapStyle,
  isLightSceneBackground,
  resolveSectionCapPalette,
  setSectionCapDaylightMode,
  subscribeSectionCapDaylightMode,
} from '../src/engine/actors/StencilSectionCap';
import {
  RIFLING_DAYLIGHT_PRESETS,
  resolveRiflingDaylightTuning,
} from '../src/engine/actors/RiflingBoreActor';
import type { ArmoryStudioLightingPreset } from '../src/engine/materials/armoryShader';
import {
  ENGINEERING_ROLE_META,
  type EngineeringRole,
} from '../src/engine/materials/engineeringRoles';
import type { MaterialKind } from '../src/weapons/types';

const ALL_PRESETS: readonly ArmoryStudioLightingPreset[] = [
  'tactical_vault',
  'gunsmith_bench',
  'blueprint_daylight',
];

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

describe('Cycle 24C — Blueprint Daylight Architectural Drafting-Ink Cutaway Caps & Helical Rifling Contrast', () => {
  it('preserves Dark Studio cap palettes unchanged while delivering high-contrast Prussian drafting ink & rich end-grain in Blueprint Daylight', () => {
    // 1. Dark Studio (isDaylight === false) remains 100% identical to legacy Dark-Vault palettes
    const darkSteel = resolveSectionCapPalette(
      'standard',
      null,
      false,
      'nitride_steel'
    );
    expect(darkSteel.base).toBe('#94a3b8');
    expect(darkSteel.hatch).toBe('#475569');
    expect(darkSteel.inkRimStrength).toBe(0);
    expect(darkSteel.daylightInk).toBe(0);

    const darkPoly = resolveSectionCapPalette(
      'standard',
      null,
      false,
      'polymer_frame'
    );
    expect(darkPoly.base).toBe('#334155');
    expect(darkPoly.hatch).toBe('#64748b');

    const darkWood = resolveSectionCapPalette(
      'wood_stock',
      null,
      false,
      'polymer_frame'
    );
    expect(darkWood.base).toBe('#8b5a34');
    expect(darkWood.hatch).toBe('#5c371c');
    expect(darkWood.organicGrain).toBe(1);

    // 2. Blueprint Daylight (isDaylight === true): Swiss Prussian drafting ink on machined steel
    const daySteel = resolveSectionCapPalette(
      'standard',
      null,
      true,
      'nitride_steel'
    );
    expect(daySteel.daylightInk).toBe(1);
    expect(daySteel.inkRimStrength).toBeGreaterThan(0.5);
    expect(relativeLuminance(daySteel.base)).toBeGreaterThan(0.55);
    expect(relativeLuminance(daySteel.hatch)).toBeLessThan(0.06);
    expect(contrastRatio(daySteel.base, daySteel.hatch)).toBeGreaterThanOrEqual(
      6.0
    );
    // Prussian cobalt-navy ink has cool blue dominance over red
    const [hr, , hb] = parseHexRgb(daySteel.hatch);
    expect(hb).toBeGreaterThan(hr * 2.2);

    // Steel vs polymer fills stay clearly separated in Blueprint Daylight
    const dayPoly = resolveSectionCapPalette(
      'standard',
      null,
      true,
      'polymer_frame'
    );
    expect(relativeLuminance(dayPoly.base)).toBeLessThan(
      relativeLuminance(daySteel.base) * 0.5
    );
    expect(contrastRatio(dayPoly.base, dayPoly.hatch)).toBeGreaterThan(3.0);

    // Walnut & Bakelite gain deeper, higher-contrast end-grain rings in Blueprint Daylight
    const dayWood = resolveSectionCapPalette(
      'wood_stock',
      null,
      true,
      'polymer_frame'
    );
    const dayBakelite = resolveSectionCapPalette(
      'bakelite',
      null,
      true,
      'polymer_frame'
    );
    expect(dayWood.organicGrain).toBe(1);
    expect(dayBakelite.organicGrain).toBeGreaterThan(0.4);
    expect(relativeLuminance(dayWood.hatch)).toBeLessThan(
      relativeLuminance(darkWood.hatch)
    );
    expect(contrastRatio(dayWood.base, dayWood.hatch)).toBeGreaterThan(
      contrastRatio(darkWood.base, darkWood.hatch)
    );
    const [wr, , wb] = parseHexRgb(dayWood.base);
    expect(wr).toBeGreaterThan(wb * 1.8);

    // Engineering role tint preserves role identity while enabling subtle daylight architectural rim
    const allRoles = Object.keys(ENGINEERING_ROLE_META) as EngineeringRole[];
    for (const role of allRoles) {
      const dayRole = resolveSectionCapPalette(
        'standard',
        role,
        true,
        'nitride_steel'
      );
      expect(dayRole.base).toBe(ENGINEERING_ROLE_META[role].capBaseHex);
      expect(dayRole.hatch).toBe(ENGINEERING_ROLE_META[role].capHatchHex);
      expect(dayRole.inkRimStrength).toBeGreaterThan(0);
      expect(dayRole.organicGrain).toBe(0);
    }

    // All 7 MaterialKinds return valid hex colours & finite parameters in both themes
    const allKinds: readonly MaterialKind[] = [
      'nitride_steel',
      'barrel_steel',
      'stainless',
      'polymer_frame',
      'spring_steel',
      'follower_orange',
      'copper_accent',
    ];
    for (const kind of allKinds) {
      for (const isDaylight of [false, true]) {
        const s = getSectionCapStyle(kind, 'slide', null, 1, null, isDaylight);
        expect(s.base).toMatch(/^#[0-9a-f]{6}$/i);
        expect(s.hatch).toMatch(/^#[0-9a-f]{6}$/i);
        expect(s.inkRim).toMatch(/^#[0-9a-f]{6}$/i);
        expect(Number.isFinite(s.inkRimStrength)).toBe(true);
        expect(Number.isFinite(s.daylightInk)).toBe(true);
      }
    }
  });

  it('caches distinct dark vs daylight cap ShaderMaterials without leaks and drives live studio switches via zero-circularity bridge', () => {
    const darkMat1 = getSectionCapMaterial(
      'nitride_steel',
      'slide',
      null,
      1,
      null,
      false
    );
    const darkMat2 = getSectionCapMaterial(
      'nitride_steel',
      'slide',
      null,
      1,
      null,
      false
    );
    const dayMat1 = getSectionCapMaterial(
      'nitride_steel',
      'slide',
      null,
      1,
      null,
      true
    );
    const dayMat2 = getSectionCapMaterial(
      'nitride_steel',
      'slide',
      null,
      1,
      null,
      true
    );

    expect(darkMat1).toBe(darkMat2);
    expect(dayMat1).toBe(dayMat2);
    expect(dayMat1).not.toBe(darkMat1);
    expect(darkMat1.uniforms.uDaylightInk.value).toBe(0);
    expect(darkMat1.uniforms.uInkRimStrength.value).toBe(0);
    expect(dayMat1.uniforms.uDaylightInk.value).toBe(1);
    expect(dayMat1.uniforms.uInkRimStrength.value).toBeGreaterThan(0.5);

    // Reactive studio-lighting bridge notifies strictly on change and cleans up cleanly
    setSectionCapDaylightMode(false);
    expect(getSectionCapDaylightMode()).toBe(false);
    let calls = 0;
    const unsub = subscribeSectionCapDaylightMode(() => {
      calls += 1;
    });
    try {
      setSectionCapDaylightMode(false);
      expect(calls).toBe(0);
      setSectionCapDaylightMode(true);
      expect(getSectionCapDaylightMode()).toBe(true);
      expect(calls).toBe(1);
      setSectionCapDaylightMode(true);
      expect(calls).toBe(1);
      setSectionCapDaylightMode(false);
      expect(getSectionCapDaylightMode()).toBe(false);
      expect(calls).toBe(2);
    } finally {
      unsub();
      setSectionCapDaylightMode(false);
    }

    // Scene background luminance detector separates daylight vs dark/bench accurately
    expect(isLightSceneBackground(new THREE.Color('#dce4ee'))).toBe(true);
    expect(isLightSceneBackground(new THREE.Color('#0b1629'))).toBe(false);
    expect(isLightSceneBackground(new THREE.Color('#171a21'))).toBe(false);
    expect(isLightSceneBackground(null)).toBeNull();

    // Verify zero-circularity: StencilSectionCap stays inside armory-materials without importing useAppStore
    const capSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/actors/StencilSectionCap.tsx'),
      'utf8'
    );
    expect(capSrc).not.toMatch(/import[\s\S]*?from\s+['"][^'"]*useAppStore/);
    expect(capSrc).toContain('useSyncExternalStore');
    expect(capSrc).toContain('capRef.current.material = capMat');

    // Verify all numeric clamp / smoothstep literals in CAP_FRAGMENT are strictly ordered
    const fragStart = capSrc.indexOf('const CAP_FRAGMENT =');
    const fragEnd = capSrc.indexOf('`;', fragStart);
    expect(fragStart).toBeGreaterThan(-1);
    const capFrag = capSrc.slice(fragStart, fragEnd);
    const clampRe =
      /clamp\(\s*[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = clampRe.exec(capFrag)) !== null) {
      expect(Number(m[1])).toBeLessThan(Number(m[2]));
    }
    const smoothRe =
      /smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g;
    while ((m = smoothRe.exec(capFrag)) !== null) {
      expect(Number(m[1])).toBeLessThan(Number(m[2]));
    }
  });

  it('calibrates helical rifling bore contrast monotonically for Blueprint Daylight with Zero-GC live toggle wiring', () => {
    for (const preset of ALL_PRESETS) {
      const a = resolveRiflingDaylightTuning(preset);
      const b = resolveRiflingDaylightTuning(preset);
      // Frozen singleton return -> zero per-frame allocations
      expect(a).toBe(b);
      expect(Object.isFrozen(a)).toBe(true);
      expect(Number.isFinite(a.boreEnvMapMultiplier)).toBe(true);
      expect(Number.isFinite(a.throatEnvMapMultiplier)).toBe(true);
      expect(Number.isFinite(a.boreRoughnessDelta)).toBe(true);
      expect(Number.isFinite(a.throatRoughnessDelta)).toBe(true);
      expect(Number.isFinite(a.normalScale)).toBe(true);
      expect(a.boreEnvMapMultiplier).toBeGreaterThan(0);
      expect(a.normalScale).toBeGreaterThan(1);
    }

    // Monotonicity across Dark Vault -> Gunsmith Bench -> Blueprint Daylight
    const vault = RIFLING_DAYLIGHT_PRESETS.tactical_vault;
    const bench = RIFLING_DAYLIGHT_PRESETS.gunsmith_bench;
    const day = RIFLING_DAYLIGHT_PRESETS.blueprint_daylight;

    expect(vault.boreEnvMapMultiplier).toBe(1);
    expect(vault.boreRoughnessDelta).toBe(0);
    expect(vault.normalScale).toBe(1.35);

    expect(day.boreEnvMapMultiplier).toBeLessThan(bench.boreEnvMapMultiplier);
    expect(bench.boreEnvMapMultiplier).toBeLessThan(vault.boreEnvMapMultiplier);
    expect(day.normalScale).toBeGreaterThan(bench.normalScale);
    expect(bench.normalScale).toBeGreaterThan(vault.normalScale);
    expect(day.boreRoughnessDelta).toBeGreaterThan(vault.boreRoughnessDelta);
    expect(relativeLuminance(day.boreTintHexChrome)).toBeLessThan(
      relativeLuminance(vault.boreTintHexChrome)
    );
    expect(relativeLuminance(day.boreTintHexSteel)).toBeLessThan(
      relativeLuminance(vault.boreTintHexSteel)
    );

    // Static check on RiflingBoreActor live-toggle material sync & Zero-GC useFrame
    const riflingSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/actors/RiflingBoreActor.tsx'),
      'utf8'
    );
    expect(riflingSrc).toContain(
      "setSectionCapDaylightMode(environmentPreset === 'blueprint_daylight')"
    );
    expect(riflingSrc).toContain(
      'boreMat.normalScale.set(studioTuning.normalScale, studioTuning.normalScale)'
    );
    expect(riflingSrc).toContain(
      'boreMat.normalScale.set(tuning.normalScale, tuning.normalScale)'
    );

    const useFrameIdx = riflingSrc.indexOf('useFrame(');
    expect(useFrameIdx).toBeGreaterThan(-1);
    const useFrameBlock = riflingSrc.slice(
      useFrameIdx,
      riflingSrc.indexOf('if (!bounds || !geometries)', useFrameIdx)
    );
    expect(useFrameBlock).not.toMatch(/\bnew\s+THREE\./);
    expect(useFrameBlock).toContain('resolveRiflingDaylightTuning(');
    expect(useFrameBlock).toContain('setSectionCapDaylightMode(');
  });
});

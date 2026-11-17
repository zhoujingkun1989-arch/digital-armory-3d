import { beforeEach, describe, expect, it } from 'vitest';
import { getSectionCapStyle } from '../src/engine/actors/StencilSectionCap';
import {
  createArmoryShaderUniforms,
  getArmoryProgramCacheKey,
} from '../src/engine/materials/armoryShader';
import {
  ENGINEERING_ROLE_META,
  ENGINEERING_ROLE_ORDER,
  type EngineeringRole,
  resolvePartEngineeringRole,
  WEAPON_GAS_MANIFOLD_PROFILES,
} from '../src/engine/materials/engineeringRoles';
import {
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  WEAPON_FIRING_TIMING,
} from '../src/engine/physics/armoryPhysics';
import {
  detectBrowserDefaultLanguage,
  detectPreferredLanguage,
  useAppStore,
} from '../src/store/useAppStore';
import { isArcheryWeapon } from '../src/engine/physics/armoryPhysics';
import { getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const GAS_OPERATED_WEAPONS: ReadonlySet<WeaponId> = new Set([
  'ak15',
  'm4a1',
  'scar',
  'deagle',
  'aug',
]);

const ELASTIC_DRIVE_WEAPONS: ReadonlySet<WeaponId> = new Set([
  'lift33',
  'r500',
]);

describe('WP-05 Engineering Functional Role Tint & Gas-Flow Contracts', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it('defines bilingual metadata and valid sRGB palettes for all 6 canonical engineering roles', () => {
    expect(ENGINEERING_ROLE_ORDER).toHaveLength(6);
    const hexPattern = /^#[0-9a-fA-F]{6}$/;

    for (const role of ENGINEERING_ROLE_ORDER) {
      const meta = ENGINEERING_ROLE_META[role];
      expect(meta).toBeDefined();
      expect(meta.role).toBe(role);
      expect(meta.labelZh.length).toBeGreaterThan(1);
      expect(meta.labelEn.length).toBeGreaterThan(1);
      expect(meta.shortZh.length).toBeGreaterThan(1);
      expect(meta.shortEn.length).toBeGreaterThan(1);
      expect(meta.descZh.length).toBeGreaterThan(8);
      expect(meta.descEn.length).toBeGreaterThan(8);
      expect(meta.colorHex).toMatch(hexPattern);
      expect(meta.capBaseHex).toMatch(hexPattern);
      expect(meta.capHatchHex).toMatch(hexPattern);
      expect(meta.mixStrength).toBeGreaterThanOrEqual(0.5);
      expect(meta.mixStrength).toBeLessThanOrEqual(1.0);
    }
  });

  it('classifies all 327 procedural/CSG parts across 13 weapons with exact gas & elastic-drive fidelity', async () => {
    const validRoles = new Set<EngineeringRole>(ENGINEERING_ROLE_ORDER);
    let totalParts = 0;

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const roleCounts = new Map<EngineeringRole, number>();

      for (const part of plugin.parts) {
        totalParts += 1;
        const role = resolvePartEngineeringRole(weaponId, part);
        expect(validRoles.has(role)).toBe(true);
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }

      // Every weapon must cover locking/cam, carrier/string, fire control, springs/dampers, and housing/feed
      expect(roleCounts.get('locking') ?? 0).toBeGreaterThan(0);
      expect(roleCounts.get('bolt_carrier') ?? 0).toBeGreaterThan(0);
      expect(roleCounts.get('fire_control') ?? 0).toBeGreaterThan(0);
      expect(roleCounts.get('energy_spring') ?? 0).toBeGreaterThan(0);
      expect(roleCounts.get('housing_feed') ?? 0).toBeGreaterThan(0);

      // Gas-operated firearms & elastic-limb archery platforms classify energy-drive parts as 'gas_drive';
      // recoil/blowback/manual firearms must not.
      if (GAS_OPERATED_WEAPONS.has(weaponId) || ELASTIC_DRIVE_WEAPONS.has(weaponId)) {
        expect(roleCounts.get('gas_drive') ?? 0).toBeGreaterThan(0);
      } else {
        expect(roleCounts.get('gas_drive') ?? 0).toBe(0);
      }
    }

    expect(totalParts).toBe(327);
  });

  it('keeps WebGL shader program cache keys 100% invariant when functional tint uniforms toggle', () => {
    const uniforms = createArmoryShaderUniforms('nitride_steel');
    expect(uniforms.uFunctionalTint.value).toBeDefined();
    expect(uniforms.uFunctionalTintMix.value).toBe(0);

    const features = {
      spring: false,
      curvature: true,
      thermal: true,
      fouling: true,
      triplanarMap: false,
    };
    const keyBefore = getArmoryProgramCacheKey(features);

    uniforms.uFunctionalTint.value.set(ENGINEERING_ROLE_META.locking.colorHex);
    uniforms.uFunctionalTintMix.value =
      ENGINEERING_ROLE_META.locking.mixStrength;

    const keyAfter = getArmoryProgramCacheKey(features);
    expect(keyAfter).toBe(keyBefore);
  });

  it('synchronizes Two-Pass Stencil cross-section cap base and ISO 45° hatch colors with engineering roles', () => {
    const defaultSteel = getSectionCapStyle('barrel_steel', 'slide', null);
    for (const role of ENGINEERING_ROLE_ORDER) {
      const roleStyled = getSectionCapStyle('barrel_steel', 'slide', role);
      expect(roleStyled.base).toBe(ENGINEERING_ROLE_META[role].capBaseHex);
      expect(roleStyled.hatch).toBe(ENGINEERING_ROLE_META[role].capHatchHex);
      expect(roleStyled.hatchDir).toBe(defaultSteel.hatchDir);
      expect(roleStyled.hatchSpacing).toBe(defaultSteel.hatchSpacing);
    }
  });

  it('aligns all 13 weapon energy-manifold profiles with internal ballistics gas-port timing', () => {
    const sample = createInternalBallisticsSample();

    for (const weaponId of WEAPON_IDS) {
      const profile = WEAPON_GAS_MANIFOLD_PROFILES[weaponId];
      const timing = WEAPON_FIRING_TIMING[weaponId];
      const manifest = getWeaponManifest(weaponId);

      expect(profile).toBeDefined();
      expect(profile.weaponId).toBe(weaponId);
      expect(profile.muzzleX).toBeGreaterThan(profile.chamberX);
      expect(profile.familyTitleZh.length).toBeGreaterThan(3);
      expect(profile.familyTitleEn.length).toBeGreaterThan(3);
      expect(profile.flowNoteZh.length).toBeGreaterThan(10);
      expect(profile.flowNoteEn.length).toBeGreaterThan(10);

      const hasTimingGasTap = timing.gasPortTravel !== null;
      expect(profile.hasGasTap).toBe(hasTimingGasTap);
      expect(profile.hasGasTap).toBe(GAS_OPERATED_WEAPONS.has(weaponId));

      if (profile.hasGasTap) {
        expect(profile.gasPortX).not.toBeNull();
        expect(profile.gasPortX!).toBeGreaterThan(profile.chamberX);
        expect(profile.gasPortX!).toBeLessThan(profile.muzzleX);

        // Near muzzle exit, projectile has uncovered the gas port and gasPortPressureMPa > 0
        evaluateInternalBallisticsInto(
          manifest.caliberProfile,
          timing.muzzleExitF,
          sample,
          timing
        );
        expect(sample.gasPortPressureMPa).toBeGreaterThan(0);
      } else {
        if (!isArcheryWeapon(weaponId)) {
          expect(profile.gasPortX).toBeNull();
        }
        evaluateInternalBallisticsInto(
          manifest.caliberProfile,
          timing.muzzleExitF,
          sample,
          timing
        );
        expect(sample.gasPortPressureMPa).toBe(0);
      }
    }
  });

  it('manages engineeringTint, role spotlighting, gasFlowVisible, and auto-locale preferences cleanly', () => {
    expect(detectBrowserDefaultLanguage({ languages: ['zh-CN', 'en-US'] })).toBe(
      'zh'
    );
    expect(detectBrowserDefaultLanguage({ language: 'zh-Hant-HK' })).toBe('zh');
    expect(detectBrowserDefaultLanguage({ languages: ['en-US', 'zh-CN'] })).toBe(
      'en'
    );
    expect(detectBrowserDefaultLanguage({ language: 'ja-JP' })).toBe('en');
    expect(detectBrowserDefaultLanguage(null)).toBe('zh');

    expect(
      detectPreferredLanguage({ languages: ['zh-CN'] }, '?weapon=g17&lang=en')
    ).toBe('en');
    expect(
      detectPreferredLanguage({ languages: ['en-GB'] }, '?lang=zh')
    ).toBe('zh');
    expect(
      detectPreferredLanguage({ languages: ['en-GB'] }, '?weapon=m4a1')
    ).toBe('en');

    const store = useAppStore.getState();
    expect(store.engineeringTint).toBe(false);
    expect(store.focusedEngineeringRole).toBeNull();
    expect(store.gasFlowVisible).toBe(true);

    // Selecting a spotlight role automatically enables engineeringTint
    store.setFocusedEngineeringRole('gas_drive');
    expect(useAppStore.getState().engineeringTint).toBe(true);
    expect(useAppStore.getState().focusedEngineeringRole).toBe('gas_drive');

    // Clicking the same role toggles spotlight off while keeping tint active
    useAppStore.getState().setFocusedEngineeringRole('gas_drive');
    expect(useAppStore.getState().engineeringTint).toBe(true);
    expect(useAppStore.getState().focusedEngineeringRole).toBeNull();

    // Turning off engineeringTint clears any active role spotlight
    useAppStore.getState().setFocusedEngineeringRole('locking');
    useAppStore.getState().toggleEngineeringTint();
    expect(useAppStore.getState().engineeringTint).toBe(false);
    expect(useAppStore.getState().focusedEngineeringRole).toBeNull();

    // Toggling gasFlowVisible
    useAppStore.getState().toggleGasFlowVisible();
    expect(useAppStore.getState().gasFlowVisible).toBe(false);
  });
});

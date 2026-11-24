import { beforeEach, describe, expect, it } from 'vitest';
import {
  ATTACHMENT_PRESET_ORDER,
  ATTACHMENT_PRESET_SPECS,
  DEFAULT_ATTACHMENT_LOADOUT,
  MUZZLE_ATTACHMENT_ORDER,
  MUZZLE_ATTACHMENT_SPECS,
  NEUTRAL_PHYSICS_DELTA,
  OPTIC_ATTACHMENT_ORDER,
  OPTIC_ATTACHMENT_SPECS,
  WEAPON_ATTACHMENT_PROFILES,
  computeCombinedAttachmentPhysics,
  computeMountedMuzzleExitX,
  getAttachmentReplacedPartIds,
  getWeaponAttachmentMountProfile,
  isMuzzleCompatible,
  isOpticCompatible,
  isWeaponAttachmentBenchSupported,
  resolvePresetForWeapon,
} from '../src/engine/attachments/attachmentSpecs';
import {
  getActiveWeaponAttachmentPhysics,
  getCachedCombinedAttachmentPhysics,
  getWeaponAttachmentLoadout,
  selectIsPartReplacedByAttachment,
  useAttachmentStore,
} from '../src/engine/attachments/attachmentStore';
import {
  CALIBER_ACOUSTIC_PROFILES,
  computeModifiedGunshotAcoustics,
} from '../src/engine/audio/mechanicalSoundEngine';
import {
  applyArmoryShot,
  getArmoryPhysicsState,
  resetArmoryPhysics,
} from '../src/engine/physics/armoryPhysics';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { getWeaponManifest } from '../src/weapons/manifests';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

describe('Track B3 — Modular Optics & Muzzle Attachment Bench', () => {
  beforeEach(() => {
    useAttachmentStore.getState().resetAll();
    resetArmoryPhysics();
  });

  describe('1. Anchor Math & Full 29-Exhibit Coverage', () => {
    it('defines a mount profile for every single weapon in WEAPON_IDS (29/29)', () => {
      expect(Object.keys(WEAPON_ATTACHMENT_PROFILES).length).toBe(
        WEAPON_IDS.length
      );
      for (const id of WEAPON_IDS) {
        const profile = getWeaponAttachmentMountProfile(id);
        expect(profile.weaponId).toBe(id);
        expect(profile.modelScale).toBeGreaterThan(0);
        expect(profile.allowedMuzzles).toContain('none');
        expect(profile.allowedOptics).toContain('none');
      }
    });

    it('aligns every compatible firearm muzzleAnchor Y exactly with manifest boreY', () => {
      for (const id of WEAPON_IDS) {
        const profile = getWeaponAttachmentMountProfile(id);
        const manifest = getWeaponManifest(id);
        if (profile.muzzleAnchor) {
          const [mx, my, mz] = profile.muzzleAnchor;
          expect(Number.isFinite(mx)).toBe(true);
          expect(Number.isFinite(my)).toBe(true);
          expect(mz).toBe(0);
          // Must sit on the exact barrel bore centerline Y (±0.01 cm tolerance)
          expect(Math.abs(my - manifest.workbenchMeta.muzzlePos[1])).toBeLessThanOrEqual(
            0.01
          );
          // Barrel shoulder anchor must be at or slightly behind stock muzzle crown (zero forward gap!)
          expect(mx).toBeLessThanOrEqual(manifest.workbenchMeta.muzzlePos[0] + 0.05);
        }
      }
    });

    it('places every compatible firearm opticRailAnchor strictly above boreY', () => {
      for (const id of WEAPON_IDS) {
        const profile = getWeaponAttachmentMountProfile(id);
        const manifest = getWeaponManifest(id);
        if (profile.opticRailAnchor) {
          const [ox, oy, oz] = profile.opticRailAnchor;
          expect(Number.isFinite(ox)).toBe(true);
          expect(Number.isFinite(oy)).toBe(true);
          expect(oz).toBe(0);
          expect(oy).toBeGreaterThan(manifest.workbenchMeta.muzzlePos[1]);
        }
      }
    });

    it('computes forward-shifted muzzle exit X monotonically (suppressor > brake > flash_hider)', () => {
      const testWeapons: WeaponId[] = ['ak15', 'm4a1', 'scar', 'g17', 'm82a1', 'rem870'];
      for (const w of testWeapons) {
        const fallbackX = getWeaponManifest(w).workbenchMeta.muzzlePos[0];
        const xNone = computeMountedMuzzleExitX(w, 'none', fallbackX);
        const xFh = computeMountedMuzzleExitX(w, 'flash_hider', fallbackX);
        const xBrake = computeMountedMuzzleExitX(w, 'muzzle_brake', fallbackX);
        const xSupp = computeMountedMuzzleExitX(w, 'suppressor', fallbackX);

        expect(xNone).toBe(fallbackX);
        expect(xSupp).toBeGreaterThan(xBrake);
        expect(xBrake).toBeGreaterThan(xFh);
        expect(xFh).toBeGreaterThan(
          getWeaponAttachmentMountProfile(w).muzzleAnchor![0]
        );
      }

      // Incompatible platforms gracefully fall back to factory muzzleX
      expect(computeMountedMuzzleExitX('ztz99a', 'suppressor', 710)).toBe(710);
      expect(computeMountedMuzzleExitX('vss', 'suppressor', 47.4)).toBe(47.4);
    });
  });

  describe('2. Platform Compatibility Matrix', () => {
    it('cleanly skips compound bows/crossbows & 1:1 Main Battle Tanks with engineering notes', () => {
      const excluded: WeaponId[] = [
        'lift33',
        'r500',
        'ztz99a',
        'm1a2',
        'leopard2a7',
        'tiger1',
      ];
      for (const id of excluded) {
        const p = getWeaponAttachmentMountProfile(id);
        expect(isWeaponAttachmentBenchSupported(id)).toBe(false);
        expect(isMuzzleCompatible(id, 'suppressor')).toBe(false);
        expect(isOpticCompatible(id, 'red_dot')).toBe(false);
        expect(p.muzzleCompatibilityNoteZh).toBeTruthy();
        expect(p.muzzleCompatibilityNoteEn).toBeTruthy();
        expect(p.opticCompatibilityNoteZh).toBeTruthy();
        expect(p.opticCompatibilityNoteEn).toBeTruthy();
      }
    });

    it('enforces firearm-specific mechanical compatibility constraints', () => {
      // Standard rifles/carbines/snipers/shotguns/LMG accept full suite
      for (const id of [
        'ak15',
        'm4a1',
        'scar',
        'awm',
        'm82a1',
        'benellim4',
        'm249',
        'vector',
        'an94',
        'rem870',
      ] as const) {
        expect(isMuzzleCompatible(id, 'suppressor')).toBe(true);
        expect(isMuzzleCompatible(id, 'muzzle_brake')).toBe(true);
        expect(isMuzzleCompatible(id, 'flash_hider')).toBe(true);
        expect(isOpticCompatible(id, 'red_dot')).toBe(true);
        expect(isOpticCompatible(id, 'lpvo')).toBe(true);
        expect(isOpticCompatible(id, 'thermal')).toBe(true);
      }

      // Reciprocating-slide pistols accept Micro Reflex Red Dot only (no heavy LPVO/thermal)
      for (const id of ['g17', 'p320'] as const) {
        expect(isMuzzleCompatible(id, 'suppressor')).toBe(true);
        expect(isOpticCompatible(id, 'red_dot')).toBe(true);
        expect(isOpticCompatible(id, 'lpvo')).toBe(false);
        expect(isOpticCompatible(id, 'thermal')).toBe(false);
      }

      // Colt Python revolver has open cylinder gap -> disallows suppressor, allows brake/red_dot
      expect(isMuzzleCompatible('python', 'suppressor')).toBe(false);
      expect(isMuzzleCompatible('python', 'muzzle_brake')).toBe(true);
      expect(isOpticCompatible('python', 'red_dot')).toBe(true);

      // Luger P08 toggle joint buckles upward 53.5° -> disallows top optics, allows muzzle devices
      expect(isMuzzleCompatible('p08', 'suppressor')).toBe(true);
      expect(isOpticCompatible('p08', 'red_dot')).toBe(false);

      // VSS is integrally suppressed -> disallows muzzle devices, accepts all optics
      expect(isMuzzleCompatible('vss', 'suppressor')).toBe(false);
      expect(isOpticCompatible('vss', 'lpvo')).toBe(true);
      expect(isOpticCompatible('vss', 'thermal')).toBe(true);

      // M134D 6-barrel rotating Gatling cluster -> disallows single-bore muzzle devices
      expect(isMuzzleCompatible('m134', 'suppressor')).toBe(false);
      expect(isOpticCompatible('m134', 'red_dot')).toBe(true);
      expect(isOpticCompatible('m134', 'thermal')).toBe(true);
    });
  });

  describe('3. Quantitative Physics, Acoustics & Recoil Coupling', () => {
    it('combines muzzle & optic physics deltas accurately', () => {
      expect(computeCombinedAttachmentPhysics('none', 'none')).toEqual(
        NEUTRAL_PHYSICS_DELTA
      );

      const stealth = computeCombinedAttachmentPhysics('suppressor', 'thermal');
      expect(stealth.soundDbDelta).toBe(-28);
      expect(stealth.lowPassHz).toBe(1280);
      expect(stealth.gasBaffleRetention).toBeCloseTo(0.82, 4);
      expect(stealth.muzzleVelocityMultiplier).toBeGreaterThan(1.0);
      expect(stealth.recoilRiseMultiplier).toBeLessThan(0.86);
      expect(stealth.addedMassGrams).toBe(
        MUZZLE_ATTACHMENT_SPECS.suppressor.physics.addedMassGrams +
          OPTIC_ATTACHMENT_SPECS.thermal.physics.addedMassGrams
      );

      const race = computeCombinedAttachmentPhysics('muzzle_brake', 'red_dot');
      expect(race.soundDbDelta).toBe(6);
      expect(race.lowPassHz).toBeNull();
      expect(race.sideBlastRatio).toBeGreaterThanOrEqual(0.8);
      expect(race.recoilRiseMultiplier).toBeLessThan(0.65);

      // All bounded ratios stay strictly within [0..1]
      for (const m of MUZZLE_ATTACHMENT_ORDER) {
        for (const o of OPTIC_ATTACHMENT_ORDER) {
          const d = computeCombinedAttachmentPhysics(m, o);
          expect(d.gasBaffleRetention).toBeGreaterThanOrEqual(0);
          expect(d.gasBaffleRetention).toBeLessThanOrEqual(1);
          expect(d.sideBlastRatio).toBeGreaterThanOrEqual(0);
          expect(d.sideBlastRatio).toBeLessThanOrEqual(1);
          expect(d.flashAttenuation).toBeGreaterThanOrEqual(0);
          expect(d.flashAttenuation).toBeLessThanOrEqual(1);
          expect(d.addedMassGrams).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('shifts Web Audio gunshot acoustics dramatically between stock, suppressor & muzzle brake', () => {
      const base = CALIBER_ACOUSTIC_PROFILES['556_nato'];
      const acStock = computeModifiedGunshotAcoustics(
        base,
        NEUTRAL_PHYSICS_DELTA,
        'none'
      );
      const acSupp = computeModifiedGunshotAcoustics(
        base,
        MUZZLE_ATTACHMENT_SPECS.suppressor.physics,
        'suppressor'
      );
      const acBrake = computeModifiedGunshotAcoustics(
        base,
        MUZZLE_ATTACHMENT_SPECS.muzzle_brake.physics,
        'muzzle_brake'
      );
      const acFh = computeModifiedGunshotAcoustics(
        base,
        MUZZLE_ATTACHMENT_SPECS.flash_hider.physics,
        'flash_hider'
      );

      // Suppressor tightens low-pass cutoff, attenuates crack & tail, and adds baffle thump
      expect(acSupp.crackFilterType).toBe('lowpass');
      expect(acSupp.crackCutoffHz).toBeLessThanOrEqual(1280);
      expect(acSupp.crackCutoffHz).toBeLessThan(acStock.crackCutoffHz);
      expect(acSupp.crackGain).toBeLessThan(acStock.crackGain * 0.5);
      expect(acSupp.subGain).toBeLessThan(acStock.subGain * 0.5);
      expect(acSupp.baffleThumpGain).toBeGreaterThan(0.25);
      expect(acSupp.lateralCrackGain).toBe(0);

      // Muzzle brake boosts high-frequency cutoff & adds strong lateral concussion crack
      expect(acBrake.crackCutoffHz).toBeGreaterThan(acStock.crackCutoffHz);
      expect(acBrake.lateralCrackGain).toBeGreaterThan(0.5);
      expect(acBrake.tailGain).toBeGreaterThan(acStock.tailGain);
      expect(acBrake.baffleThumpGain).toBe(0);

      // 3-prong flash hider introduces subtle tuning-fork prong ring
      expect(acFh.prongPingGain).toBeGreaterThan(0);
    });

    it('scales physical recoil velocities proportionally in armoryPhysics.applyArmoryShot', () => {
      resetArmoryPhysics();
      applyArmoryShot('556_nato', 1.0);
      const stockKick = Math.abs(getArmoryPhysicsState().recoilVelX);
      const stockRise = Math.abs(getArmoryPhysicsState().recoilVelY);
      const stockClimb = Math.abs(getArmoryPhysicsState().recoilPitchVel);

      resetArmoryPhysics();
      const brakeMult = MUZZLE_ATTACHMENT_SPECS.muzzle_brake.physics.recoilRiseMultiplier;
      applyArmoryShot('556_nato', brakeMult);
      const brakeKick = Math.abs(getArmoryPhysicsState().recoilVelX);
      const brakeRise = Math.abs(getArmoryPhysicsState().recoilVelY);
      const brakeClimb = Math.abs(getArmoryPhysicsState().recoilPitchVel);

      expect(brakeKick / stockKick).toBeCloseTo(brakeMult, 4);
      expect(brakeRise / stockRise).toBeCloseTo(brakeMult, 4);
      expect(brakeClimb / stockClimb).toBeCloseTo(brakeMult, 4);
    });
  });

  describe('4. Attachment Store State Transitions & Preset Resolution', () => {
    it('isolates loadouts per weapon and rejects incompatible attachments cleanly', () => {
      const store = useAttachmentStore.getState();

      expect(store.setMuzzle('ak15', 'suppressor')).toBe(true);
      expect(store.setOptic('ak15', 'lpvo')).toBe(true);
      expect(getWeaponAttachmentLoadout('ak15')).toEqual({
        muzzle: 'suppressor',
        optic: 'lpvo',
      });
      // Other weapons stay untouched at Factory Stock
      expect(getWeaponAttachmentLoadout('m4a1')).toEqual(
        DEFAULT_ATTACHMENT_LOADOUT
      );

      // Incompatible assignments return false and do NOT mutate state
      expect(store.setOptic('g17', 'lpvo')).toBe(false);
      expect(getWeaponAttachmentLoadout('g17')).toEqual(
        DEFAULT_ATTACHMENT_LOADOUT
      );
      expect(store.setMuzzle('ztz99a', 'suppressor')).toBe(false);
      expect(store.setMuzzle('vss', 'muzzle_brake')).toBe(false);
      expect(store.setMuzzle('python', 'suppressor')).toBe(false);

      // Compatible assignments succeed and update Zero-GC cached physics lookup
      expect(store.setMuzzle('g17', 'suppressor')).toBe(true);
      expect(store.setOptic('g17', 'red_dot')).toBe(true);
      const physRef1 = getActiveWeaponAttachmentPhysics('g17');
      const physRef2 = getCachedCombinedAttachmentPhysics(
        'suppressor',
        'red_dot'
      );
      expect(physRef1).toBe(physRef2); // Exact cached reference (Zero-GC)
      expect(physRef1.soundDbDelta).toBe(-28);
    });

    it('resolves all 4 tactical presets cleanly per platform without invalid combinations', () => {
      for (const presetId of ATTACHMENT_PRESET_ORDER) {
        expect(ATTACHMENT_PRESET_SPECS[presetId]).toBeDefined();
        for (const weaponId of WEAPON_IDS) {
          const resolved = resolvePresetForWeapon(weaponId, presetId);
          expect(isMuzzleCompatible(weaponId, resolved.muzzle)).toBe(true);
          expect(isOpticCompatible(weaponId, resolved.optic)).toBe(true);
        }
      }

      // Pistol Stealth Ops clamps Thermal -> Red Dot while keeping Suppressor
      const g17Stealth = useAttachmentStore
        .getState()
        .applyPreset('g17', 'stealth_ops');
      expect(g17Stealth).toEqual({ muzzle: 'suppressor', optic: 'red_dot' });

      // Rifle Stealth Ops mounts Suppressor + Thermal
      const m4Stealth = useAttachmentStore
        .getState()
        .applyPreset('m4a1', 'stealth_ops');
      expect(m4Stealth).toEqual({ muzzle: 'suppressor', optic: 'thermal' });

      // Factory Stock restores clean neutral state & removes map key
      useAttachmentStore.getState().applyPreset('m4a1', 'factory');
      expect(getWeaponAttachmentLoadout('m4a1')).toEqual(
        DEFAULT_ATTACHMENT_LOADOUT
      );
      expect(useAttachmentStore.getState().loadouts.m4a1).toBeUndefined();
    });

    it('tracks replaced factory parts accurately to prevent mesh collision', () => {
      // M4A1 replaces flash hider when muzzle mounted & carry handle when optic mounted
      expect(getAttachmentReplacedPartIds('m4a1', 'none', 'none')).toEqual([]);
      expect(
        getAttachmentReplacedPartIds('m4a1', 'suppressor', 'none')
      ).toEqual(['m4a1_flash_hider']);
      expect(getAttachmentReplacedPartIds('m4a1', 'none', 'lpvo')).toEqual([
        'm4a1_carry_handle',
      ]);

      useAttachmentStore.getState().setMuzzle('m4a1', 'muzzle_brake');
      useAttachmentStore.getState().setOptic('m4a1', 'red_dot');
      const snap = useAttachmentStore.getState();
      expect(
        selectIsPartReplacedByAttachment(snap, 'm4a1', 'm4a1_flash_hider')
      ).toBe(true);
      expect(
        selectIsPartReplacedByAttachment(snap, 'm4a1', 'm4a1_carry_handle')
      ).toBe(true);
      expect(
        selectIsPartReplacedByAttachment(snap, 'm4a1', 'm4a1_barrel')
      ).toBe(false);

      // Resetting restores stock parts & benchOpen toggles cleanly
      useAttachmentStore.getState().setBenchOpen(true);
      expect(useAttachmentStore.getState().benchOpen).toBe(true);
      useAttachmentStore.getState().toggleBenchOpen();
      expect(useAttachmentStore.getState().benchOpen).toBe(false);
      useAttachmentStore.getState().resetWeapon('m4a1');
      expect(
        selectIsPartReplacedByAttachment(
          useAttachmentStore.getState(),
          'm4a1',
          'm4a1_carry_handle'
        )
      ).toBe(false);
    });
  });

  describe('5. 100% Bilingual UI Dictionary Parity', () => {
    it('provides non-empty Chinese & English strings for every Attachment Bench entry', () => {
      const zhKeys = Object.keys(UI_STRINGS.zh.attachmentBench).sort();
      const enKeys = Object.keys(UI_STRINGS.en.attachmentBench).sort();
      expect(zhKeys).toEqual(enKeys);
      for (const k of zhKeys) {
        const key = k as keyof typeof UI_STRINGS.zh.attachmentBench;
        expect(UI_STRINGS.zh.attachmentBench[key].trim().length).toBeGreaterThan(
          0
        );
        expect(UI_STRINGS.en.attachmentBench[key].trim().length).toBeGreaterThan(
          0
        );
      }
      expect(UI_STRINGS.zh.workbench.attachmentsChip).toBeTruthy();
      expect(UI_STRINGS.en.workbench.attachmentsChip).toBeTruthy();
    });
  });
});

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BAKELITE_SECTION_CAP_PART_IDS,
  SECTION_CUT_PLANES,
  TANK_SECTION_HATCH_SCALE,
  WOOD_SECTION_CAP_PART_IDS,
  computeSectionCapTransformInto,
  getSectionCapMaterial,
  getSectionCapStyle,
  getSectionCutRange,
  getSideMountedShellLocalZOffset,
  isThinWallCutawayShell,
  resolveSectionCapMaterialVariant,
  syncLiveSectionCutPlane,
  syncLocalZOffsetSectionPlane,
} from '../src/engine/actors/StencilSectionCap';
import {
  getWeaponAttachmentMountProfile,
  type MuzzleAttachmentId,
} from '../src/engine/attachments/attachmentSpecs';
import {
  selectIsPartReplacedByAttachment,
  useAttachmentStore,
} from '../src/engine/attachments/attachmentStore';
import {
  ARMORY_ENVIRONMENTS,
  getStudioCycloramaPalette,
  paintHeavyArmorHangarAlpha,
} from '../src/engine/canvas/GunsmithStageMat';
import {
  STUDIO_SOFTBOX_REFLECTION_CARDS,
  getStudioHdriEnvIntensity,
  getStudioHdriEnvIntensityForScale,
} from '../src/engine/canvas/studioHdriManager';
import { loadWeaponGeometryBuilders } from '../src/weapons/geometryLoaders';
import {
  K98K_STRIPPER_CLIP_EXPLODE_REVEAL_T,
  computeK98kFiringKinematics,
  isK98kStripperClipVisible,
} from '../src/weapons/k98k/plugin';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

function createMockImageDataContext(w: number, h: number): {
  ctx: CanvasRenderingContext2D;
  buf: Uint8ClampedArray;
} {
  const buf = new Uint8ClampedArray(w * h * 4);
  const ctx = {
    getImageData: () => ({ data: buf, width: w, height: h }),
    putImageData: (img: { data: Uint8ClampedArray }) => {
      if (img.data !== buf) buf.set(img.data);
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, buf };
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

describe('Cycle 2A — Visual Realism, Studio Lighting, Cutaway Caps, K98k Clip & Muzzle Seam Hygiene', () => {
  beforeEach(() => {
    useAttachmentStore.getState().resetAll();
    syncLiveSectionCutPlane(0, false, 'rifle', 'z');
  });

  it('marks deagle_grip, mg42_ammo_drum, and mg42_grip_frame as cutaway shells and slices the left-flank MG 42 drum across its coiled Gurt 34 belt', async () => {
    const deaglePlugin = await loadWeaponPlugin('deagle');
    const deagleGrip = deaglePlugin.parts.find((p) => p.id === 'deagle_grip');
    expect(deagleGrip, 'deagle_grip must exist').toBeDefined();
    expect(deagleGrip!.isShell).toBe(true);

    const mg42Plugin = await loadWeaponPlugin('mg42');
    const mg42Drum = mg42Plugin.parts.find((p) => p.id === 'mg42_ammo_drum');
    const mg42Belt = mg42Plugin.parts.find((p) => p.id === 'mg42_ammo_belt');
    const mg42Grip = mg42Plugin.parts.find((p) => p.id === 'mg42_grip_frame');
    expect(mg42Drum?.isShell).toBe(true);
    expect(mg42Grip?.isShell).toBe(true);
    expect(mg42Belt).toBeDefined();

    // Left-flank MG 42 Gurttrommel sits entirely behind Z = 0, so it requires a local-Z section plane
    // and renders as a thin-wall hollow drum shell rather than a solid filled metal block.
    const drumLocalOffset = getSideMountedShellLocalZOffset('mg42_ammo_drum');
    expect(drumLocalOffset).not.toBeNull();
    expect(drumLocalOffset!).toBeLessThan(0);
    expect(isThinWallCutawayShell('mg42_ammo_drum')).toBe(true);
    expect(isThinWallCutawayShell('deagle_grip')).toBe(false);

    const mg42Builders = await loadWeaponGeometryBuilders('mg42');
    const drumGeo = mg42Builders.mg42_ammo_drum();
    const beltGeo = mg42Builders.mg42_ammo_belt();
    try {
      drumGeo.computeBoundingBox();
      beltGeo.computeBoundingBox();

      const drumMatrix = new THREE.Matrix4().makeTranslation(
        mg42Drum!.assembledPos[0],
        mg42Drum!.assembledPos[1],
        mg42Drum!.assembledPos[2]
      );
      const drumPlane = new THREE.Plane();
      syncLocalZOffsetSectionPlane(
        drumMatrix,
        SECTION_CUT_PLANES[0],
        drumLocalOffset!,
        drumPlane
      );

      // The local-Z plane must straddle the drum geometry (producing a live cutaway cap)
      const capMatrix = new THREE.Matrix4();
      const straddles = computeSectionCapTransformInto(
        drumGeo.boundingBox!,
        drumMatrix,
        drumPlane,
        0.16,
        capMatrix
      );
      expect(straddles).toBe(true);

      // Every belted 7.92x57mm round must sit strictly on the camera-facing (+Z) side of the sliced drum back-cap
      const cutWorldZ = -drumPlane.constant / drumPlane.normal.z;
      const beltMinWorldZ = mg42Belt!.assembledPos[2] + beltGeo.boundingBox!.min.z;
      expect(cutWorldZ).toBeLessThan(beltMinWorldZ);
    } finally {
      drumGeo.dispose();
      beltGeo.dispose();
    }
  });

  it('routes wood stocks/grips and bakelite furniture to warm organic palettes instead of steel-blue CAD hatching, and raises TANK_SECTION_HATCH_SCALE >= 16', () => {
    expect(TANK_SECTION_HATCH_SCALE).toBeGreaterThanOrEqual(16);
    expect(TANK_SECTION_HATCH_SCALE).toBe(18);
    expect(getSectionCutRange('main_battle_tank').hatchScale).toBe(18);

    // Every wood furniture part must resolve to warm walnut/beech wood_stock (never CAD slate-blue)
    const keyWoodParts = [
      'k98k_stock',
      'k98k_handguard',
      'garand_walnut_stock',
      'garand_rear_handguard',
      'garand_front_handguard',
      'thompson_buttstock',
      'thompson_pistol_grip',
      'thompson_foregrip',
      'win94_walnut_stock',
      'win94_forend',
      'rem870_walnut_stock',
      'rem870_forend',
      'vss_wood_stock',
      'm1911_grip_left',
      'm1911_grip_right',
      'p08_grip_left',
      'p08_grip_right',
      'python_grip_left',
      'python_grip_right',
    ];
    for (const partId of keyWoodParts) {
      expect(WOOD_SECTION_CAP_PART_IDS.has(partId)).toBe(true);
      expect(resolveSectionCapMaterialVariant(partId, 'polymer_frame')).toBe(
        'wood_stock'
      );
      const style = getSectionCapStyle('polymer_frame', 'frame', null, 1, partId);
      expect(style.variant).toBe('wood_stock');
      expect(style.organicGrain).toBe(1);
      expect(style.base).toBe('#8b5a34');
      expect(style.hatch).toBe('#5c371c');
      const [r, , b] = parseHexRgb(style.base);
      expect(r).toBeGreaterThan(b * 1.8);
    }

    // Wartime bakelite parts (MG 42 buttstock & grip) route to marbled bakelite amber-chestnut
    for (const bakeliteId of ['mg42_buttstock', 'mg42_grip_frame']) {
      expect(BAKELITE_SECTION_CAP_PART_IDS.has(bakeliteId)).toBe(true);
      const style = getSectionCapStyle(
        'polymer_frame',
        'fire_control',
        null,
        1,
        bakeliteId
      );
      expect(style.variant).toBe('bakelite');
      expect(style.organicGrain).toBeGreaterThan(0.4);
      const [r, , b] = parseHexRgb(style.base);
      expect(r).toBeGreaterThan(b * 1.8);
    }

    // Synthetic nylon/rubber parts keep standard polymer CAD hatch; steel parts stay steel
    for (const synthId of [
      'deagle_grip',
      'ak_lower_handguard',
      'aug_stock',
      'p90_stock',
      'p320_grip_module',
    ]) {
      const style = getSectionCapStyle('polymer_frame', 'frame', null, 1, synthId);
      expect(style.variant).toBe('standard');
      expect(style.base).toBe('#334155');
      expect(style.organicGrain).toBe(0);
    }
    expect(resolveSectionCapMaterialVariant('k98k_stock', 'nitride_steel')).toBe(
      'standard'
    );

    // Shader material uniforms reflect organic wood grain vs standard CAD hatch cleanly
    const k98kWoodMat = getSectionCapMaterial(
      'polymer_frame',
      'frame',
      null,
      1,
      'k98k_stock'
    );
    const polymerMat = getSectionCapMaterial(
      'polymer_frame',
      'frame',
      null,
      1,
      'deagle_grip'
    );
    expect(k98kWoodMat.uniforms.uOrganicGrain.value).toBe(1);
    expect(polymerMat.uniforms.uOrganicGrain.value).toBe(0);

    // Principle tint engineeringRole still overrides base/hatch cleanly when active
    const tintedWood = getSectionCapStyle(
      'polymer_frame',
      'frame',
      'housing_feed',
      1,
      'k98k_stock'
    );
    expect(tintedWood.organicGrain).toBe(0);
  });

  it('upgrades studio cyclorama backlight, chrome horizontal softbox reflection cards, and heavy-armor hangar floor feathering without breaking lighting bounds', () => {
    // Radial cyclorama backlight (#1d2d44 center -> #070b12 outer vignette in tactical_vault; crisp daylight)
    const vaultSmall = getStudioCycloramaPalette('tactical_vault', 'rifle');
    expect(vaultSmall.keyGlow).toBe('#1d2d44');
    expect(vaultSmall.zenith).toBe('#070b12');
    expect(vaultSmall.nadir).toBe('#070b12');
    expect(vaultSmall.keyGlowStrength).toBeGreaterThanOrEqual(0.8);

    const benchSmall = getStudioCycloramaPalette('gunsmith_bench', 'rifle');
    expect(benchSmall.keyGlowStrength).toBeGreaterThanOrEqual(0.65);

    const daylight = getStudioCycloramaPalette('blueprint_daylight', 'rifle');
    expect(daylight.horizon).toBe('#edf2f8');
    expect(daylight.zenith).toBe('#d4dde9');

    // Grazing rim & fill lighting separation + wide horizontal studio softbox lightformers
    const vaultEnv = ARMORY_ENVIRONMENTS.tactical_vault;
    const benchEnv = ARMORY_ENVIRONMENTS.gunsmith_bench;
    expect(vaultEnv.background).toBe('#0b1017');
    expect(benchEnv.background).toBe('#14181f');
    expect(vaultEnv.rimLight.intensity).toBeGreaterThanOrEqual(2.0);
    expect(benchEnv.rimLight.intensity).toBeGreaterThanOrEqual(1.35);
    expect(vaultEnv.toneMappingExposure).toBeGreaterThanOrEqual(0.85);
    expect(vaultEnv.toneMappingExposure).toBeLessThanOrEqual(1.45);
    expect(
      vaultEnv.lightformers.some((lf) => lf.scale[0] >= 40 && lf.position[2] > 15)
    ).toBe(true);
    expect(
      benchEnv.lightformers.some((lf) => lf.scale[0] >= 40 && lf.position[2] > 15)
    ).toBe(true);

    // HDRI horizontal chrome softbox reflection cards span both +Z and -Z vertical reflection arcs
    for (const preset of ['tactical_vault', 'gunsmith_bench'] as const) {
      const cards = STUDIO_SOFTBOX_REFLECTION_CARDS[preset];
      expect(cards.length).toBeGreaterThanOrEqual(6);
      expect(cards.some((c) => c.position[2] > 15 && c.scale[0] >= 40)).toBe(true);
      expect(cards.some((c) => c.position[2] < -15 && c.scale[0] >= 40)).toBe(true);
      expect(getStudioHdriEnvIntensity(preset)).toBeGreaterThanOrEqual(0.8);
      expect(getStudioHdriEnvIntensity(preset)).toBeLessThanOrEqual(1.3);
    }
    expect(
      getStudioHdriEnvIntensityForScale('tactical_vault', 'main_battle_tank')
    ).toBeLessThanOrEqual(1.35);

    // Heavy-armor concrete hangar alpha mask retains opaque center, zero perimeter, and broad smooth feather
    const w = 128;
    const h = 96;
    const { ctx, buf } = createMockImageDataContext(w, h);
    paintHeavyArmorHangarAlpha(ctx, w, h);
    const alphaAt = (x: number, y: number) => buf[(y * w + x) * 4];
    expect(alphaAt(w >> 1, h >> 1)).toBe(255);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(w - 1, 0)).toBe(0);
    expect(alphaAt(w >> 1, 0)).toBe(0);
    expect(alphaAt(0, h >> 1)).toBe(0);
    let midToneCount = 0;
    for (let i = 0; i < w * h; i++) {
      const a = buf[i * 4];
      if (a > 10 && a < 245) midToneCount++;
    }
    expect(midToneCount).toBeGreaterThan(500);
  });

  it('stows k98k_stripper_clip cleanly when assembled with closed bolt and reveals it during explode, field-strip, selection, and open-bolt reload', () => {
    // Closed assembled rifle (t = 0) & cutaway at t = 0: strictly hidden!
    expect(isK98kStripperClipVisible('explode', 0, 0, false, false)).toBe(false);
    expect(
      isK98kStripperClipVisible(
        'explode',
        K98K_STRIPPER_CLIP_EXPLODE_REVEAL_T,
        0,
        false,
        false
      )
    ).toBe(false);

    // Exploded disassembly (t > 0.04): revealed cleanly
    expect(isK98kStripperClipVisible('explode', 0.05, 0, false, false)).toBe(true);
    expect(isK98kStripperClipVisible('explode', 1.0, 0, false, false)).toBe(true);

    // Field-strip (step 0 removes clip) & explicit BOM selection keep it visible
    expect(isK98kStripperClipVisible('explode', 0, 0, true, false)).toBe(true);
    expect(isK98kStripperClipVisible('explode', 0, 0, false, true)).toBe(true);

    // Firing mode: hidden while bolt is closed/locked, revealed only when bolt is drawn open
    expect(isK98kStripperClipVisible('firing', 0, 0, false, false)).toBe(false);
    expect(isK98kStripperClipVisible('firing', 0, 0.35, false, false)).toBe(false);
    expect(isK98kStripperClipVisible('firing', 0, 0.66, false, false)).toBe(true);
    expect(isK98kStripperClipVisible('firing', 0, 0.92, false, false)).toBe(false);
    expect(isK98kStripperClipVisible('firing', 0, 1.0, false, false)).toBe(false);

    // Periodic smooth kinematics with zero rest/end discontinuity
    const k0 = computeK98kFiringKinematics('k98k_stripper_clip', 0);
    const k1 = computeK98kFiringKinematics('k98k_stripper_clip', 1);
    const kMid = computeK98kFiringKinematics('k98k_stripper_clip', 0.66);
    const kEject = computeK98kFiringKinematics('k98k_stripper_clip', 0.78);
    expect(k0.pos).toEqual([0, 0, 0]);
    expect(k1.pos).toEqual([0, 0, 0]);
    expect(Math.abs(kMid.pos[1])).toBeLessThan(0.05);
    expect(kEject.pos[1]).toBeGreaterThan(2.0);
  });

  it('replaces every removable factory muzzle device across all 34 exhibits and seats aftermarket muzzle collars flush over barrel crush washers with zero double-collar seam', async () => {
    const FACTORY_MUZZLE_PART_RE =
      /(?:_muzzle_device|_flash_hider|_flash_suppressor|_muzzle_brake|_muzzle_booster|_cutts_comp)$/;

    const checkedWeapons: WeaponId[] = [];
    for (const manifest of WEAPON_MANIFESTS) {
      const profile = getWeaponAttachmentMountProfile(manifest.id);
      if (!profile.muzzleAnchor) continue;

      const plugin = await loadWeaponPlugin(manifest.id);
      const factoryMuzzleParts = plugin.parts.filter((p) =>
        FACTORY_MUZZLE_PART_RE.test(p.id)
      );
      for (const fp of factoryMuzzleParts) {
        expect(
          profile.muzzleReplacedPartIds,
          `${manifest.id}: factory muzzle part ${fp.id} must be listed in muzzleReplacedPartIds`
        ).toContain(fp.id);

        // Verify runtime replacement selector hides factory part whenever any aftermarket muzzle is mounted
        for (const mId of ['flash_hider', 'muzzle_brake', 'suppressor'] as MuzzleAttachmentId[]) {
          if (!profile.allowedMuzzles.includes(mId)) continue;
          useAttachmentStore.getState().setMuzzle(manifest.id, mId);
          expect(
            selectIsPartReplacedByAttachment(
              useAttachmentStore.getState(),
              manifest.id,
              fp.id
            ),
            `${manifest.id}/${fp.id} must be hidden when ${mId} is mounted`
          ).toBe(true);
        }
        useAttachmentStore.getState().setMuzzle(manifest.id, 'none');
        expect(
          selectIsPartReplacedByAttachment(
            useAttachmentStore.getState(),
            manifest.id,
            fp.id
          )
        ).toBe(false);
      }

      if (factoryMuzzleParts.length > 0) {
        checkedWeapons.push(manifest.id);
      }
    }

    // All 12 removable-factory-muzzle platforms verified
    expect(checkedWeapons).toEqual(
      expect.arrayContaining([
        'ak15',
        'm4a1',
        'm82a1',
        'awm',
        'scar',
        'aug',
        'p90',
        'vector',
        'g11',
        'an94',
        'mg42',
        'thompson',
      ])
    );

    // M4A1 & rifle shoulder-flush seating check:
    // Aftermarket rear collar extends to local X = -0.48, encapsulating the M4A1 factory A2 crush washer (X = 21.86)
    // while keeping the bare barrel crown inside the solid collar (local X <= +1.28) with zero double-collar seam.
    const flushRifles: WeaponId[] = [
      'm4a1',
      'ak15',
      'scar',
      'awm',
      'm82a1',
      'aug',
      'p90',
      'vector',
      'g11',
    ];
    for (const wid of flushRifles) {
      const profile = getWeaponAttachmentMountProfile(wid);
      const plugin = await loadWeaponPlugin(wid);
      const builders = await loadWeaponGeometryBuilders(wid);
      const barrelPart = plugin.parts.find((p) => p.id.endsWith('_barrel'))!;
      const factoryMuzzlePart = plugin.parts.find((p) =>
        FACTORY_MUZZLE_PART_RE.test(p.id)
      )!;
      const barrelGeo = builders[barrelPart.id]();
      const fmGeo = builders[factoryMuzzlePart.id]();
      try {
        barrelGeo.computeBoundingBox();
        fmGeo.computeBoundingBox();
        const barrelCrownX = barrelPart.assembledPos[0] + barrelGeo.boundingBox!.max.x;
        const factoryRearX =
          factoryMuzzlePart.assembledPos[0] + fmGeo.boundingBox!.min.x;
        const anchorX = profile.muzzleAnchor![0];
        const rearSleeveWorldX = anchorX - 0.48 * profile.modelScale;
        const solidCollarFrontWorldX = anchorX + 1.28 * profile.modelScale;

        expect(
          rearSleeveWorldX,
          `${wid}: rear sleeve (${rearSleeveWorldX.toFixed(2)}) must reach back past factory muzzle seat (${factoryRearX.toFixed(2)})`
        ).toBeLessThanOrEqual(factoryRearX + 0.05);
        expect(
          barrelCrownX,
          `${wid}: barrel crown (${barrelCrownX.toFixed(2)}) must stay inside solid rear collar (${solidCollarFrontWorldX.toFixed(2)})`
        ).toBeLessThanOrEqual(solidCollarFrontWorldX + 0.05);
      } finally {
        barrelGeo.dispose();
        fmGeo.dispose();
      }
    }

    // Explicit M4A1 crush-washer coverage assertion (crush washer sits at X = 21.80..21.92)
    const m4Profile = getWeaponAttachmentMountProfile('m4a1');
    const m4RearSleeveX = m4Profile.muzzleAnchor![0] - 0.48 * m4Profile.modelScale;
    expect(m4RearSleeveX).toBeLessThanOrEqual(21.8);
  });
});

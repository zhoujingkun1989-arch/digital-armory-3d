import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  type GLTF,
  GLTFLoader,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PbrBindingSpec, WeaponId } from '../../weapons/types';
import { resolveAssetUrl, resolveModelUrl } from '../utils/assetUrl';
import { attachCurvatureAttribute } from './curvatureBuilder';

/**
 * Dual-Track Draco GLB Asset Registry & Geometry Normalizer (`PR-02`)
 * -------------------------------------------------------------------
 * Supplies Blender-authored, Cycles-baked Draco-compressed `.glb` solid meshes
 * for migrated flagship exhibits while keeping dynamic helical springs on the
 * procedural CSG Web Worker track so `aSpringParam` GPU compression remains exact.
 *
 * Coordinate & UV Invariants:
 *  - World units: `1 world unit = 1 cm` (`+X` muzzle, `+Y` up, `+Z` right flank).
 *  - Every part mesh is authored in local part space matching `assembledPos` / `assembledRot`
 *    in `src/weapons/<id>/plugin.ts`, with identity glTF node transforms (any non-identity
 *    node transform is cleanly baked into geometry on extraction).
 *  - glTF 2.0 stores `v_gltf = 1 - v_blender` (`0` = image top). We flip `uv.y = 1 - uv.y`
 *    once on extracted GLB BufferGeometries so `pbrManager.ts` (`TextureLoader` with
 *    `flipY = true`) samples standard upright WebP textures & OpenGL `+Y` Cycles normal maps
 *    100% uniformly without per-texture `flipY` branching.
 */

export interface GlbWeaponAssetConfig {
  /** Filename inside `public/models/` (e.g. `'p08.glb'`, `'ak15.glb'`). */
  modelFile: string;
  /**
   * Part IDs intentionally skipped from GLB extraction so the CSG Worker provides
   * helical coil meshes carrying per-vertex `aSpringParam` GPU deformation data.
   */
  dynamicSpringParts: readonly string[];
  /**
   * Per-part v3 Cycles-baked 2K 5-channel Packed ORM (`R=AO, G=Roughness, B=Metalness`)
   * PBR atlas bindings active when `geometry.userData.isGlbAsset === true`.
   */
  pbrOverrides: Readonly<Record<string, PbrBindingSpec>>;
}

const P08_V3_WALNUT_PBR: PbrBindingSpec = {
  albedoFile: 'p08_v3_walnut_albedo.webp',
  normalFile: 'p08_v3_walnut_normal.webp',
  roughnessFile: 'p08_v3_walnut_roughness.webp',
  normalScale: 0.85,
};

const P08_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'p08_v3_metal_albedo.webp',
  normalFile: 'p08_v3_metal_normal.webp',
  roughnessFile: 'p08_v3_metal_roughness.webp',
  normalScale: 0.72,
};

const AK15_V3_FURNITURE_PBR: PbrBindingSpec = {
  albedoFile: 'ak15_v3_furniture_albedo.webp',
  normalFile: 'ak15_v3_furniture_normal.webp',
  roughnessFile: 'ak15_v3_furniture_roughness.webp',
  normalScale: 0.92,
};

const AK15_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'ak15_v3_receiver_albedo.webp',
  normalFile: 'ak15_v3_receiver_normal.webp',
  roughnessFile: 'ak15_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const AK15_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'ak15_v3_metal_albedo.webp',
  normalFile: 'ak15_v3_metal_normal.webp',
  roughnessFile: 'ak15_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const PYTHON_V3_WALNUT_PBR: PbrBindingSpec = {
  albedoFile: 'python_v3_walnut_albedo.webp',
  normalFile: 'python_v3_walnut_normal.webp',
  roughnessFile: 'python_v3_walnut_roughness.webp',
  normalScale: 0.88,
};

const PYTHON_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'python_v3_metal_albedo.webp',
  normalFile: 'python_v3_metal_normal.webp',
  roughnessFile: 'python_v3_metal_roughness.webp',
  normalScale: 0.8,
};

const DEAGLE_V3_HERO_PBR: PbrBindingSpec = {
  albedoFile: 'deagle_v3_hero_albedo.webp',
  normalFile: 'deagle_v3_hero_normal.webp',
  roughnessFile: 'deagle_v3_hero_roughness.webp',
  normalScale: 0.85,
};

const DEAGLE_V3_STEEL_PBR: PbrBindingSpec = {
  albedoFile: 'deagle_v3_steel_albedo.webp',
  normalFile: 'deagle_v3_steel_normal.webp',
  roughnessFile: 'deagle_v3_steel_roughness.webp',
  normalScale: 0.82,
};

const DEAGLE_V3_GRIP_PBR: PbrBindingSpec = {
  albedoFile: 'deagle_v3_grip_albedo.webp',
  normalFile: 'deagle_v3_grip_normal.webp',
  roughnessFile: 'deagle_v3_grip_roughness.webp',
  normalScale: 0.92,
};

const M4A1_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'm4a1_v3_receiver_albedo.webp',
  normalFile: 'm4a1_v3_receiver_normal.webp',
  roughnessFile: 'm4a1_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const M4A1_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'm4a1_v3_metal_albedo.webp',
  normalFile: 'm4a1_v3_metal_normal.webp',
  roughnessFile: 'm4a1_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const M4A1_V3_FURNITURE_PBR: PbrBindingSpec = {
  albedoFile: 'm4a1_v3_furniture_albedo.webp',
  normalFile: 'm4a1_v3_furniture_normal.webp',
  roughnessFile: 'm4a1_v3_furniture_roughness.webp',
  normalScale: 0.9,
};

const M82A1_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'm82a1_v3_receiver_albedo.webp',
  normalFile: 'm82a1_v3_receiver_normal.webp',
  roughnessFile: 'm82a1_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const M82A1_V3_ORDNANCE_PBR: PbrBindingSpec = {
  albedoFile: 'm82a1_v3_ordnance_albedo.webp',
  normalFile: 'm82a1_v3_ordnance_normal.webp',
  roughnessFile: 'm82a1_v3_ordnance_roughness.webp',
  normalScale: 0.85,
};

const M82A1_V3_OPTICS_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'm82a1_v3_optics_mag_albedo.webp',
  normalFile: 'm82a1_v3_optics_mag_normal.webp',
  roughnessFile: 'm82a1_v3_optics_mag_roughness.webp',
  normalScale: 0.88,
};

const GARAND_V3_WALNUT_PBR: PbrBindingSpec = {
  albedoFile: 'garand_v3_walnut_albedo.webp',
  normalFile: 'garand_v3_walnut_normal.webp',
  roughnessFile: 'garand_v3_walnut_roughness.webp',
  normalScale: 0.9,
};

const GARAND_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'garand_v3_receiver_albedo.webp',
  normalFile: 'garand_v3_receiver_normal.webp',
  roughnessFile: 'garand_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const GARAND_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'garand_v3_metal_albedo.webp',
  normalFile: 'garand_v3_metal_normal.webp',
  roughnessFile: 'garand_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const AWM_V3_CHASSIS_PBR: PbrBindingSpec = {
  albedoFile: 'awm_v3_chassis_albedo.webp',
  normalFile: 'awm_v3_chassis_normal.webp',
  roughnessFile: 'awm_v3_chassis_roughness.webp',
  normalScale: 0.9,
};

const AWM_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'awm_v3_metal_albedo.webp',
  normalFile: 'awm_v3_metal_normal.webp',
  roughnessFile: 'awm_v3_metal_roughness.webp',
  normalScale: 0.86,
};

const AWM_V3_OPTIC_PBR: PbrBindingSpec = {
  albedoFile: 'awm_v3_optic_albedo.webp',
  normalFile: 'awm_v3_optic_normal.webp',
  roughnessFile: 'awm_v3_optic_roughness.webp',
  normalScale: 0.85,
};

const MP5_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'mp5_v3_receiver_albedo.webp',
  normalFile: 'mp5_v3_receiver_normal.webp',
  roughnessFile: 'mp5_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const MP5_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'mp5_v3_metal_albedo.webp',
  normalFile: 'mp5_v3_metal_normal.webp',
  roughnessFile: 'mp5_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const MP5_V3_FURNITURE_PBR: PbrBindingSpec = {
  albedoFile: 'mp5_v3_furniture_albedo.webp',
  normalFile: 'mp5_v3_furniture_normal.webp',
  roughnessFile: 'mp5_v3_furniture_roughness.webp',
  normalScale: 0.9,
};

const G17_V3_SLIDE_PBR: PbrBindingSpec = {
  albedoFile: 'g17_v3_slide_albedo.webp',
  normalFile: 'g17_v3_slide_normal.webp',
  roughnessFile: 'g17_v3_slide_roughness.webp',
  normalScale: 0.86,
};

const G17_V3_POLYMER_PBR: PbrBindingSpec = {
  albedoFile: 'g17_v3_polymer_albedo.webp',
  normalFile: 'g17_v3_polymer_normal.webp',
  roughnessFile: 'g17_v3_polymer_roughness.webp',
  normalScale: 0.92,
};

const G17_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'g17_v3_metal_albedo.webp',
  normalFile: 'g17_v3_metal_normal.webp',
  roughnessFile: 'g17_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const SCAR_V3_UPPER_PBR: PbrBindingSpec = {
  albedoFile: 'scar_v3_upper_albedo.webp',
  normalFile: 'scar_v3_upper_normal.webp',
  roughnessFile: 'scar_v3_upper_roughness.webp',
  normalScale: 0.88,
};

const SCAR_V3_FDE_POLYMER_PBR: PbrBindingSpec = {
  albedoFile: 'scar_v3_fde_polymer_albedo.webp',
  normalFile: 'scar_v3_fde_polymer_normal.webp',
  roughnessFile: 'scar_v3_fde_polymer_roughness.webp',
  normalScale: 0.9,
};

const SCAR_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'scar_v3_metal_albedo.webp',
  normalFile: 'scar_v3_metal_normal.webp',
  roughnessFile: 'scar_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const AUG_V3_STOCK_PBR: PbrBindingSpec = {
  albedoFile: 'aug_v3_stock_albedo.webp',
  normalFile: 'aug_v3_stock_normal.webp',
  roughnessFile: 'aug_v3_stock_roughness.webp',
  normalScale: 0.9,
};

const AUG_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'aug_v3_receiver_albedo.webp',
  normalFile: 'aug_v3_receiver_normal.webp',
  roughnessFile: 'aug_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const AUG_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'aug_v3_metal_albedo.webp',
  normalFile: 'aug_v3_metal_normal.webp',
  roughnessFile: 'aug_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const P320_V3_SLIDE_PBR: PbrBindingSpec = {
  albedoFile: 'p320_v3_slide_albedo.webp',
  normalFile: 'p320_v3_slide_normal.webp',
  roughnessFile: 'p320_v3_slide_roughness.webp',
  normalScale: 0.86,
};

const P320_V3_GRIP_PBR: PbrBindingSpec = {
  albedoFile: 'p320_v3_grip_albedo.webp',
  normalFile: 'p320_v3_grip_normal.webp',
  roughnessFile: 'p320_v3_grip_roughness.webp',
  normalScale: 0.92,
};

const P320_V3_FCU_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'p320_v3_fcu_metal_albedo.webp',
  normalFile: 'p320_v3_fcu_metal_normal.webp',
  roughnessFile: 'p320_v3_fcu_metal_roughness.webp',
  normalScale: 0.85,
};

const P90_V3_STOCK_PBR: PbrBindingSpec = {
  albedoFile: 'p90_v3_stock_albedo.webp',
  normalFile: 'p90_v3_stock_normal.webp',
  roughnessFile: 'p90_v3_stock_roughness.webp',
  normalScale: 0.9,
};

const P90_V3_MAG_OPTIC_PBR: PbrBindingSpec = {
  albedoFile: 'p90_v3_mag_optic_albedo.webp',
  normalFile: 'p90_v3_mag_optic_normal.webp',
  roughnessFile: 'p90_v3_mag_optic_roughness.webp',
  normalScale: 0.85,
};

const P90_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'p90_v3_metal_albedo.webp',
  normalFile: 'p90_v3_metal_normal.webp',
  roughnessFile: 'p90_v3_metal_roughness.webp',
  normalScale: 0.86,
};

export const GLB_WEAPON_CONFIGS: Readonly<
  Partial<Record<WeaponId, GlbWeaponAssetConfig>>
> = {
  p08: {
    modelFile: 'p08.glb',
    dynamicSpringParts: [
      'p08_recoil_spring',
      'p08_striker_spring',
      'p08_mag_spring',
    ],
    pbrOverrides: {
      // European walnut checkered grip panels (2 parts)
      p08_grip_left: P08_V3_WALNUT_PBR,
      p08_grip_right: P08_V3_WALNUT_PBR,
      // Imperial rust-blued steel, 240°C straw-gold & bright white steel (20 parts)
      p08_barrel: P08_V3_METAL_PBR,
      p08_barrel_extension: P08_V3_METAL_PBR,
      p08_breechblock: P08_V3_METAL_PBR,
      p08_extractor: P08_V3_METAL_PBR,
      p08_front_toggle: P08_V3_METAL_PBR,
      p08_rear_toggle: P08_V3_METAL_PBR,
      p08_toggle_pins: P08_V3_METAL_PBR,
      p08_striker: P08_V3_METAL_PBR,
      p08_frame: P08_V3_METAL_PBR,
      p08_sideplate: P08_V3_METAL_PBR,
      p08_takedown_lever: P08_V3_METAL_PBR,
      p08_ejector: P08_V3_METAL_PBR,
      p08_hold_open: P08_V3_METAL_PBR,
      p08_trigger: P08_V3_METAL_PBR,
      p08_trigger_lever: P08_V3_METAL_PBR,
      p08_sear_bar: P08_V3_METAL_PBR,
      p08_thumb_safety: P08_V3_METAL_PBR,
      p08_mag_body: P08_V3_METAL_PBR,
      p08_mag_follower: P08_V3_METAL_PBR,
      p08_mag_base: P08_V3_METAL_PBR,
    },
  },
  ak15: {
    modelFile: 'ak15.glb',
    dynamicSpringParts: ['ak_recoil_spring', 'ak_mag_spring'],
    pbrOverrides: {
      // Glass-filled polyamide furniture & windowed magazine (8 parts)
      ak_upper_handguard: AK15_V3_FURNITURE_PBR,
      ak_lower_handguard: AK15_V3_FURNITURE_PBR,
      ak_buttstock: AK15_V3_FURNITURE_PBR,
      ak_cheek_riser: AK15_V3_FURNITURE_PBR,
      ak_pistol_grip: AK15_V3_FURNITURE_PBR,
      ak_mag_body: AK15_V3_FURNITURE_PBR,
      ak_mag_follower: AK15_V3_FURNITURE_PBR,
      ak_mag_floorplate: AK15_V3_FURNITURE_PBR,
      // Dedicated 2K Stamped Receiver, Railed Top Cover, Diopter Sight & Ambi Selector hero suite (4 parts)
      ak_receiver: AK15_V3_RECEIVER_PBR,
      ak_dust_cover: AK15_V3_RECEIVER_PBR,
      ak_rear_sight: AK15_V3_RECEIVER_PBR,
      ak_selector: AK15_V3_RECEIVER_PBR,
      // Dedicated 2K CHF Barrel, Muzzle QD Brake, Gas Block, Chrome Piston Carrier, Bolt & FCG suite (12 parts)
      ak_bolt_carrier: AK15_V3_METAL_PBR,
      ak_bolt: AK15_V3_METAL_PBR,
      ak_firing_pin: AK15_V3_METAL_PBR,
      ak_extractor: AK15_V3_METAL_PBR,
      ak_recoil_guide: AK15_V3_METAL_PBR,
      ak_gas_tube: AK15_V3_METAL_PBR,
      ak_barrel: AK15_V3_METAL_PBR,
      ak_muzzle_device: AK15_V3_METAL_PBR,
      ak_gas_block: AK15_V3_METAL_PBR,
      ak_hammer: AK15_V3_METAL_PBR,
      ak_trigger: AK15_V3_METAL_PBR,
      ak_disconnector: AK15_V3_METAL_PBR,
    },
  },
  python: {
    modelFile: 'python.glb',
    dynamicSpringParts: ['python_mainspring', 'python_extractor_spring'],
    pbrOverrides: {
      // Checkered American walnut target grips w/ 24K gold Rampant Colt medallions (2 parts)
      python_grip_left: PYTHON_V3_WALNUT_PBR,
      python_grip_right: PYTHON_V3_WALNUT_PBR,
      // Mirror-gloss Royal Blue steel, jewel-polished stainless internals & speedloader (21 parts)
      python_barrel: PYTHON_V3_METAL_PBR,
      python_front_sight: PYTHON_V3_METAL_PBR,
      python_rear_sight: PYTHON_V3_METAL_PBR,
      python_barrel_pin: PYTHON_V3_METAL_PBR,
      python_detent_plunger: PYTHON_V3_METAL_PBR,
      python_frame: PYTHON_V3_METAL_PBR,
      python_sideplate: PYTHON_V3_METAL_PBR,
      python_sideplate_screws: PYTHON_V3_METAL_PBR,
      python_cylinder_latch: PYTHON_V3_METAL_PBR,
      python_hammer: PYTHON_V3_METAL_PBR,
      python_hammer_stirrup: PYTHON_V3_METAL_PBR,
      python_trigger: PYTHON_V3_METAL_PBR,
      python_rebound_lever: PYTHON_V3_METAL_PBR,
      python_cylinder_bolt: PYTHON_V3_METAL_PBR,
      python_hand: PYTHON_V3_METAL_PBR,
      python_firing_pin: PYTHON_V3_METAL_PBR,
      python_crane: PYTHON_V3_METAL_PBR,
      python_cylinder: PYTHON_V3_METAL_PBR,
      python_extractor_star: PYTHON_V3_METAL_PBR,
      python_extractor_rod: PYTHON_V3_METAL_PBR,
      python_speedloader: PYTHON_V3_METAL_PBR,
    },
  },
  deagle: {
    modelFile: 'deagle.glb',
    dynamicSpringParts: ['deagle_recoil_springs'],
    pbrOverrides: {
      // Dedicated 2K Brushed Satin 416 Stainless / Hard Chrome hero suite (3 parts)
      deagle_barrel: DEAGLE_V3_HERO_PBR,
      deagle_slide: DEAGLE_V3_HERO_PBR,
      deagle_frame: DEAGLE_V3_HERO_PBR,
      // Nitrided steel controls, blued steel magazine, 4-lug rotating bolt & dual recoil rods (17 parts)
      deagle_bolt: DEAGLE_V3_STEEL_PBR,
      deagle_cam_pin: DEAGLE_V3_STEEL_PBR,
      deagle_firing_pin: DEAGLE_V3_STEEL_PBR,
      deagle_extractor: DEAGLE_V3_STEEL_PBR,
      deagle_safety: DEAGLE_V3_STEEL_PBR,
      deagle_front_sight: DEAGLE_V3_STEEL_PBR,
      deagle_rear_sight: DEAGLE_V3_STEEL_PBR,
      deagle_recoil_rods: DEAGLE_V3_STEEL_PBR,
      deagle_takedown_lever: DEAGLE_V3_STEEL_PBR,
      deagle_slide_stop: DEAGLE_V3_STEEL_PBR,
      deagle_mag_catch: DEAGLE_V3_STEEL_PBR,
      deagle_hammer: DEAGLE_V3_STEEL_PBR,
      deagle_hammer_strut: DEAGLE_V3_STEEL_PBR,
      deagle_trigger: DEAGLE_V3_STEEL_PBR,
      deagle_sear: DEAGLE_V3_STEEL_PBR,
      deagle_mag_body: DEAGLE_V3_STEEL_PBR,
      deagle_mag_spring: DEAGLE_V3_STEEL_PBR,
      // Stippled wraparound rubber grip, firewalled orange follower & floorplate (3 parts)
      deagle_grip: DEAGLE_V3_GRIP_PBR,
      deagle_mag_follower: DEAGLE_V3_GRIP_PBR,
      deagle_mag_baseplate: DEAGLE_V3_GRIP_PBR,
    },
  },
  m4a1: {
    modelFile: 'm4a1.glb',
    dynamicSpringParts: ['m4a1_buffer_spring'],
    pbrOverrides: {
      // Forged 7075-T6 flat-top upper/lower, A2 carry handle, T-handle, selector & dust cover (6 parts)
      m4a1_upper_receiver: M4A1_V3_RECEIVER_PBR,
      m4a1_lower_receiver: M4A1_V3_RECEIVER_PBR,
      m4a1_carry_handle: M4A1_V3_RECEIVER_PBR,
      m4a1_charging_handle: M4A1_V3_RECEIVER_PBR,
      m4a1_selector: M4A1_V3_RECEIVER_PBR,
      m4a1_dust_cover: M4A1_V3_RECEIVER_PBR,
      // 14.5" M203 barrel, A2 birdcage, FSB, oiled BCG, 7-lug bolt, DI tube, H2 buffer & FCG (12 parts)
      m4a1_barrel: M4A1_V3_METAL_PBR,
      m4a1_flash_hider: M4A1_V3_METAL_PBR,
      m4a1_front_sight_base: M4A1_V3_METAL_PBR,
      m4a1_bolt_carrier: M4A1_V3_METAL_PBR,
      m4a1_bolt: M4A1_V3_METAL_PBR,
      m4a1_firing_pin: M4A1_V3_METAL_PBR,
      m4a1_gas_tube: M4A1_V3_METAL_PBR,
      m4a1_buffer_tube: M4A1_V3_METAL_PBR,
      m4a1_buffer: M4A1_V3_METAL_PBR,
      m4a1_hammer: M4A1_V3_METAL_PBR,
      m4a1_trigger: M4A1_V3_METAL_PBR,
      m4a1_mag_spring: M4A1_V3_METAL_PBR,
      // KAC M4 RAS quad-rails, Waffle stock, A2 pistol grip & dry-film grey STANAG mag (7 parts)
      m4a1_ras_upper: M4A1_V3_FURNITURE_PBR,
      m4a1_ras_lower: M4A1_V3_FURNITURE_PBR,
      m4a1_buttstock: M4A1_V3_FURNITURE_PBR,
      m4a1_pistol_grip: M4A1_V3_FURNITURE_PBR,
      m4a1_mag_body: M4A1_V3_FURNITURE_PBR,
      m4a1_mag_follower: M4A1_V3_FURNITURE_PBR,
      m4a1_mag_floorplate: M4A1_V3_FURNITURE_PBR,
    },
  },
  m82a1: {
    modelFile: 'm82a1.glb',
    dynamicSpringParts: ['m82a1_recoil_spring', 'm82a1_barrel_springs'],
    pbrOverrides: {
      // Stamped & welded armor-steel ribbed upper/lower receivers, carry handle & selector (4 parts)
      m82a1_upper_receiver: M82A1_V3_RECEIVER_PBR,
      m82a1_lower_receiver: M82A1_V3_RECEIVER_PBR,
      m82a1_carry_handle: M82A1_V3_RECEIVER_PBR,
      m82a1_selector: M82A1_V3_RECEIVER_PBR,
      // Twin-baffle arrowhead brake, 29" fluted barrel, extension, BCG, 3-lug bolt, accelerator, bipod & FCG (11 parts)
      m82a1_muzzle_brake: M82A1_V3_ORDNANCE_PBR,
      m82a1_barrel: M82A1_V3_ORDNANCE_PBR,
      m82a1_barrel_extension: M82A1_V3_ORDNANCE_PBR,
      m82a1_bolt_carrier: M82A1_V3_ORDNANCE_PBR,
      m82a1_bolt: M82A1_V3_ORDNANCE_PBR,
      m82a1_accelerator: M82A1_V3_ORDNANCE_PBR,
      m82a1_firing_pin: M82A1_V3_ORDNANCE_PBR,
      m82a1_bipod: M82A1_V3_ORDNANCE_PBR,
      m82a1_striker: M82A1_V3_ORDNANCE_PBR,
      m82a1_sear: M82A1_V3_ORDNANCE_PBR,
      m82a1_trigger: M82A1_V3_ORDNANCE_PBR,
      // Leupold Mark 4 optic, ultra-high rings, 20-LPI A2 grip & 10-round .50 BMG steel box mag (7 parts)
      m82a1_scope: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_scope_rings: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_pistol_grip: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_mag_body: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_mag_follower: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_mag_spring: M82A1_V3_OPTICS_MAG_PBR,
      m82a1_mag_floorplate: M82A1_V3_OPTICS_MAG_PBR,
    },
  },
  garand: {
    modelFile: 'garand.glb',
    dynamicSpringParts: ['garand_op_rod_spring', 'garand_hammer_spring'],
    pbrOverrides: {
      // Hand-rubbed linseed-oil American black walnut full stock & front/rear handguards (3 parts)
      garand_walnut_stock: GARAND_V3_WALNUT_PBR,
      garand_rear_handguard: GARAND_V3_WALNUT_PBR,
      garand_front_handguard: GARAND_V3_WALNUT_PBR,
      // Forged Springfield receiver, T105 sight drums, clip latch, milled trigger housing/guard & en-bloc clip (6 parts)
      garand_receiver: GARAND_V3_RECEIVER_PBR,
      garand_rear_sight: GARAND_V3_RECEIVER_PBR,
      garand_clip_latch: GARAND_V3_RECEIVER_PBR,
      garand_trigger_housing: GARAND_V3_RECEIVER_PBR,
      garand_trigger_guard: GARAND_V3_RECEIVER_PBR,
      garand_enbloc_clip: GARAND_V3_RECEIVER_PBR,
      // 24" barrel, 410 stainless gas cylinder & lock screw, S-bent op-rod, 2-lug bolt, buttplate & internals (15 parts)
      garand_barrel: GARAND_V3_METAL_PBR,
      garand_gas_cylinder: GARAND_V3_METAL_PBR,
      garand_gas_lock_screw: GARAND_V3_METAL_PBR,
      garand_front_sight: GARAND_V3_METAL_PBR,
      garand_op_rod: GARAND_V3_METAL_PBR,
      garand_bolt: GARAND_V3_METAL_PBR,
      garand_firing_pin: GARAND_V3_METAL_PBR,
      garand_lower_band: GARAND_V3_METAL_PBR,
      garand_buttplate: GARAND_V3_METAL_PBR,
      garand_op_rod_catch: GARAND_V3_METAL_PBR,
      garand_trigger: GARAND_V3_METAL_PBR,
      garand_hammer: GARAND_V3_METAL_PBR,
      garand_follower: GARAND_V3_METAL_PBR,
      garand_follower_arm: GARAND_V3_METAL_PBR,
      garand_bullet_guide: GARAND_V3_METAL_PBR,
    },
  },
  awm: {
    modelFile: 'awm.glb',
    dynamicSpringParts: ['awm_firing_pin_spring'],
    pbrOverrides: {
      // British Military OD-Green thumbhole polyamide chassis skins, folding stock, cheekpiece, spacers & follower (5 parts)
      awm_chassis_skins: AWM_V3_CHASSIS_PBR,
      awm_folding_stock: AWM_V3_CHASSIS_PBR,
      awm_cheekpiece: AWM_V3_CHASSIS_PBR,
      awm_buttpad_spacers: AWM_V3_CHASSIS_PBR,
      awm_mag_follower: AWM_V3_CHASSIS_PBR,
      // Portsmouth steel action, 27" fluted barrel, dual-baffle brake, 60° 6-lug chrome bolt, CNC spine & match FCG (12 parts)
      awm_action_receiver: AWM_V3_METAL_PBR,
      awm_barrel: AWM_V3_METAL_PBR,
      awm_muzzle_brake: AWM_V3_METAL_PBR,
      awm_bolt_body: AWM_V3_METAL_PBR,
      awm_bolt_shroud: AWM_V3_METAL_PBR,
      awm_striker: AWM_V3_METAL_PBR,
      awm_extractor: AWM_V3_METAL_PBR,
      awm_chassis_beam: AWM_V3_METAL_PBR,
      awm_trigger_box: AWM_V3_METAL_PBR,
      awm_sear: AWM_V3_METAL_PBR,
      awm_trigger_shoe: AWM_V3_METAL_PBR,
      awm_mag_catch: AWM_V3_METAL_PBR,
      // Schmidt & Bender PM II 5-25x56 optic, 34mm mount, Parker-Hale bipod & 5-round .338 LM steel box mag (6 parts)
      awm_scope: AWM_V3_OPTIC_PBR,
      awm_scope_mount: AWM_V3_OPTIC_PBR,
      awm_bipod: AWM_V3_OPTIC_PBR,
      awm_mag_body: AWM_V3_OPTIC_PBR,
      awm_mag_spring: AWM_V3_OPTIC_PBR,
      awm_mag_floorplate: AWM_V3_OPTIC_PBR,
    },
  },
  mp5: {
    modelFile: 'mp5.glb',
    dynamicSpringParts: ['mp5_recoil_spring'],
    pbrOverrides: {
      // Stamped H&K baked black-enamel upper receiver, J-slot cocking tube, diopter drum/hooded sights & stock endcap (5 parts)
      mp5_upper_receiver: MP5_V3_RECEIVER_PBR,
      mp5_cocking_tube: MP5_V3_RECEIVER_PBR,
      mp5_front_sight: MP5_V3_RECEIVER_PBR,
      mp5_rear_sight: MP5_V3_RECEIVER_PBR,
      mp5_stock_endcap: MP5_V3_RECEIVER_PBR,
      // 3-lug CHF barrel, A3 steel-rail stock, HK-Slap handle, chrome dual rollers, 45° locking piece, BCG, trigger box & 30-rd curved mag (16 parts)
      mp5_barrel: MP5_V3_METAL_PBR,
      mp5_buttstock: MP5_V3_METAL_PBR,
      mp5_charging_handle: MP5_V3_METAL_PBR,
      mp5_bolt_carrier: MP5_V3_METAL_PBR,
      mp5_bolt_head: MP5_V3_METAL_PBR,
      mp5_locking_rollers: MP5_V3_METAL_PBR,
      mp5_locking_roller_left: MP5_V3_METAL_PBR,
      mp5_locking_piece: MP5_V3_METAL_PBR,
      mp5_firing_pin: MP5_V3_METAL_PBR,
      mp5_recoil_rod: MP5_V3_METAL_PBR,
      mp5_trigger_pack: MP5_V3_METAL_PBR,
      mp5_hammer: MP5_V3_METAL_PBR,
      mp5_trigger: MP5_V3_METAL_PBR,
      mp5_mag_body: MP5_V3_METAL_PBR,
      mp5_mag_spring: MP5_V3_METAL_PBR,
      mp5_mag_floorplate: MP5_V3_METAL_PBR,
      // Navy pictogram polymer grip housing, wide tropical forearm, ambi selector & anti-tilt orange follower (4 parts)
      mp5_grip_housing: MP5_V3_FURNITURE_PBR,
      mp5_forearm: MP5_V3_FURNITURE_PBR,
      mp5_selector: MP5_V3_FURNITURE_PBR,
      mp5_mag_follower: MP5_V3_FURNITURE_PBR,
    },
  },
  g17: {
    modelFile: 'g17.glb',
    dynamicSpringParts: ['recoil_spring', 'striker_spring'],
    pbrOverrides: {
      // Gen 5 nDLC steel slide, bullnose serrations, white-dot/U-outline sights, cover plate & LCI extractor (5 parts)
      slide: G17_V3_SLIDE_PBR,
      front_sight: G17_V3_SLIDE_PBR,
      rear_sight: G17_V3_SLIDE_PBR,
      slide_cover_plate: G17_V3_SLIDE_PBR,
      extractor: G17_V3_SLIDE_PBR,
      // Organic RTF4 polyamide frame, polymer guide rod, controls, trigger housing & 17-rd mag w/ orange follower (8 parts)
      frame: G17_V3_POLYMER_PBR,
      recoil_guide_rod: G17_V3_POLYMER_PBR,
      magazine_catch: G17_V3_POLYMER_PBR,
      trigger_housing_pin: G17_V3_POLYMER_PBR,
      trigger_housing: G17_V3_POLYMER_PBR,
      mag_body: G17_V3_POLYMER_PBR,
      mag_follower: G17_V3_POLYMER_PBR,
      mag_base_plate: G17_V3_POLYMER_PBR,
      // GMB polygonal barrel, Safe Action striker/trigger-bar internals, stainless locking block & springs (13 parts)
      barrel: G17_V3_METAL_PBR,
      striker: G17_V3_METAL_PBR,
      firing_pin_safety: G17_V3_METAL_PBR,
      extractor_plunger: G17_V3_METAL_PBR,
      locking_block: G17_V3_METAL_PBR,
      slide_lock: G17_V3_METAL_PBR,
      slide_stop_lever: G17_V3_METAL_PBR,
      trigger_pin: G17_V3_METAL_PBR,
      locking_block_pin: G17_V3_METAL_PBR,
      trigger_with_bar: G17_V3_METAL_PBR,
      connector: G17_V3_METAL_PBR,
      trigger_spring: G17_V3_METAL_PBR,
      mag_spring: G17_V3_METAL_PBR,
    },
  },
  scar: {
    modelFile: 'scar.glb',
    dynamicSpringParts: ['scar_recoil_spring'],
    pbrOverrides: {
      // Gold-bronze Type III anodized monolithic extruded upper, folding diopter rear sight & Torx crossbolts (3 parts)
      scar_upper_receiver: SCAR_V3_UPPER_PBR,
      scar_rear_sight: SCAR_V3_UPPER_PBR,
      scar_barrel_crossbolts: SCAR_V3_UPPER_PBR,
      // Fifty Shades of FDE coyote polymer lower, 20-LPI grip, folding stock, riser, buttpad, selector & follower (8 parts)
      scar_lower_receiver: SCAR_V3_FDE_POLYMER_PBR,
      scar_pistol_grip: SCAR_V3_FDE_POLYMER_PBR,
      scar_buttstock: SCAR_V3_FDE_POLYMER_PBR,
      scar_cheek_riser: SCAR_V3_FDE_POLYMER_PBR,
      scar_buttpad: SCAR_V3_FDE_POLYMER_PBR,
      scar_selector: SCAR_V3_FDE_POLYMER_PBR,
      scar_mag_follower: SCAR_V3_FDE_POLYMER_PBR,
      scar_mag_floorplate: SCAR_V3_FDE_POLYMER_PBR,
      // 14" CHF barrel, 3-prong flash suppressor, short-stroke piston, monolithic BCG, 7-lug bolt, FCG & STANAG mag (14 parts)
      scar_barrel: SCAR_V3_METAL_PBR,
      scar_flash_suppressor: SCAR_V3_METAL_PBR,
      scar_gas_block: SCAR_V3_METAL_PBR,
      scar_gas_piston: SCAR_V3_METAL_PBR,
      scar_bolt_carrier: SCAR_V3_METAL_PBR,
      scar_charging_handle: SCAR_V3_METAL_PBR,
      scar_bolt: SCAR_V3_METAL_PBR,
      scar_firing_pin: SCAR_V3_METAL_PBR,
      scar_recoil_rod: SCAR_V3_METAL_PBR,
      scar_hammer: SCAR_V3_METAL_PBR,
      scar_trigger: SCAR_V3_METAL_PBR,
      scar_disconnector: SCAR_V3_METAL_PBR,
      scar_mag_body: SCAR_V3_METAL_PBR,
      scar_mag_spring: SCAR_V3_METAL_PBR,
    },
  },
  aug: {
    modelFile: 'aug.glb',
    dynamicSpringParts: ['aug_recoil_springs'],
    pbrOverrides: {
      // Austrian Alpine OD-green PA66 monocoque stock, folding foregrip, smoked amber waffle mag & polymer hammer pack (10 parts)
      aug_stock: AUG_V3_STOCK_PBR,
      aug_buttpad: AUG_V3_STOCK_PBR,
      aug_foregrip: AUG_V3_STOCK_PBR,
      aug_trigger: AUG_V3_STOCK_PBR,
      aug_safety: AUG_V3_STOCK_PBR,
      aug_mag_body: AUG_V3_STOCK_PBR,
      aug_mag_follower: AUG_V3_STOCK_PBR,
      aug_mag_floorplate: AUG_V3_STOCK_PBR,
      aug_hammer_pack: AUG_V3_STOCK_PBR,
      aug_hammer: AUG_V3_STOCK_PBR,
      // Die-cast baked-enamel receiver w/ integral 1.5x Swarovski optic, charging handle, barrel lock & takedown pin (4 parts)
      aug_receiver_optic: AUG_V3_RECEIVER_PBR,
      aug_charging_handle: AUG_V3_RECEIVER_PBR,
      aug_barrel_lock: AUG_V3_RECEIVER_PBR,
      aug_takedown_pin: AUG_V3_RECEIVER_PBR,
      // 20" quick-change CHF barrel, tulip flash hider, 3-pos gas regulator, twin-rod chrome BCG, 7-lug bolt & bars (10 parts)
      aug_barrel: AUG_V3_METAL_PBR,
      aug_flash_hider: AUG_V3_METAL_PBR,
      aug_gas_block: AUG_V3_METAL_PBR,
      aug_gas_regulator: AUG_V3_METAL_PBR,
      aug_gas_piston: AUG_V3_METAL_PBR,
      aug_bolt_carrier: AUG_V3_METAL_PBR,
      aug_bolt: AUG_V3_METAL_PBR,
      aug_firing_pin: AUG_V3_METAL_PBR,
      aug_transfer_bars: AUG_V3_METAL_PBR,
      aug_mag_spring: AUG_V3_METAL_PBR,
    },
  },
  p320: {
    modelFile: 'p320.glb',
    dynamicSpringParts: ['p320_recoil_spring', 'p320_striker_spring'],
    pbrOverrides: {
      // Satin Coyote PVD slide w/ MIL-STD-130 UID, DPP optic cover plate, SIGLITE tritium sights & extractor (5 parts)
      p320_slide: P320_V3_SLIDE_PBR,
      p320_optic_plate_sight: P320_V3_SLIDE_PBR,
      p320_front_sight: P320_V3_SLIDE_PBR,
      p320_striker_housing: P320_V3_SLIDE_PBR,
      p320_extractor: P320_V3_SLIDE_PBR,
      // Matte Coyote polyamide grip module w/ 360° micro-pebble stippling, orange follower & baseplate (3 parts)
      p320_grip_module: P320_V3_GRIP_PBR,
      p320_mag_follower: P320_V3_GRIP_PBR,
      p320_mag_baseplate: P320_V3_GRIP_PBR,
      // Serialized 17-4PH stainless FCU chassis, 4.7" Nitron barrel, black Nitron controls & 17-rd steel magazine (14 parts)
      p320_barrel: P320_V3_FCU_METAL_PBR,
      p320_recoil_guide_rod: P320_V3_FCU_METAL_PBR,
      p320_striker: P320_V3_FCU_METAL_PBR,
      p320_safety_lock: P320_V3_FCU_METAL_PBR,
      p320_takedown_lever: P320_V3_FCU_METAL_PBR,
      p320_slide_catch: P320_V3_FCU_METAL_PBR,
      p320_mag_catch: P320_V3_FCU_METAL_PBR,
      p320_fcu_chassis: P320_V3_FCU_METAL_PBR,
      p320_trigger_shoe: P320_V3_FCU_METAL_PBR,
      p320_trigger_bar: P320_V3_FCU_METAL_PBR,
      p320_sear_group: P320_V3_FCU_METAL_PBR,
      p320_manual_safety: P320_V3_FCU_METAL_PBR,
      p320_mag_body: P320_V3_FCU_METAL_PBR,
      p320_mag_spring: P320_V3_FCU_METAL_PBR,
    },
  },
  p90: {
    modelFile: 'p90.glb',
    dynamicSpringParts: ['p90_recoil_springs', 'p90_mag_spring'],
    pbrOverrides: {
      // Charcoal-black glass-filled polyamide monocoque stock, buttplate, rotary selector & nylon hammer pack (8 parts)
      p90_stock: P90_V3_STOCK_PBR,
      p90_buttplate: P90_V3_STOCK_PBR,
      p90_mag_catches: P90_V3_STOCK_PBR,
      p90_ejection_cover: P90_V3_STOCK_PBR,
      p90_trigger: P90_V3_STOCK_PBR,
      p90_selector: P90_V3_STOCK_PBR,
      p90_hammer_pack: P90_V3_STOCK_PBR,
      p90_mag_floorplate: P90_V3_STOCK_PBR,
      // Smoked-amber 50-rd horizontal mag, 90° helical feed ramp, orange follower/hammer & MC-10-80 Ring Sight (5 parts)
      p90_mag_body: P90_V3_MAG_OPTIC_PBR,
      p90_helical_ramp: P90_V3_MAG_OPTIC_PBR,
      p90_mag_follower: P90_V3_MAG_OPTIC_PBR,
      p90_hammer: P90_V3_MAG_OPTIC_PBR,
      p90_ring_sight: P90_V3_MAG_OPTIC_PBR,
      // Die-cast aluminum upper bridge, 10.4" CHF barrel, 4-port slant comp, heavy blowback bolt & twin guide rods (10 parts)
      p90_upper_receiver: P90_V3_METAL_PBR,
      p90_barrel: P90_V3_METAL_PBR,
      p90_flash_hider: P90_V3_METAL_PBR,
      p90_charging_handles: P90_V3_METAL_PBR,
      p90_bolt: P90_V3_METAL_PBR,
      p90_firing_pin: P90_V3_METAL_PBR,
      p90_guide_rods: P90_V3_METAL_PBR,
      p90_takedown_lock: P90_V3_METAL_PBR,
      p90_sling_mount: P90_V3_METAL_PBR,
      p90_transfer_bars: P90_V3_METAL_PBR,
    },
  },
};

/** Neutral gunmetal linear vertex color fallback while 2K v3 albedo streams or when PBR is toggled off. */
const DEFAULT_LINEAR_COLOR_R = 0.24;
const DEFAULT_LINEAR_COLOR_G = 0.26;
const DEFAULT_LINEAR_COLOR_B = 0.29;

const IDENTITY_ELEMENTS = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as const;

let cachedBrowserGltfLoader: GLTFLoader | null = null;
let cachedDracoLoader: DRACOLoader | null = null;
let cachedDracoDecoderPath = '';

export function getGlbWeaponConfig(
  weaponId: WeaponId
): GlbWeaponAssetConfig | null {
  return GLB_WEAPON_CONFIGS[weaponId] ?? null;
}

export function hasGlbWeaponAsset(weaponId: WeaponId): boolean {
  return GLB_WEAPON_CONFIGS[weaponId] !== undefined;
}

export function isGlbDynamicSpringPart(
  weaponId: WeaponId,
  partId: string
): boolean {
  const cfg = GLB_WEAPON_CONFIGS[weaponId];
  if (!cfg) return false;
  return cfg.dynamicSpringParts.includes(partId);
}

export function getGlbPartPbrOverride(
  weaponId: WeaponId,
  partId: string
): PbrBindingSpec | undefined {
  return GLB_WEAPON_CONFIGS[weaponId]?.pbrOverrides[partId];
}

/**
 * Resolves the subpath-safe trailing-slash directory containing `draco_decoder.wasm`,
 * `draco_wasm_wrapper.js`, and `draco_decoder.js` inside `public/draco/`.
 */
export function resolveDracoDecoderPath(baseOverride?: string): string {
  const url = resolveAssetUrl('draco/', baseOverride);
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Resolves the subpath-safe `.glb` model URL for a migrated weapon, or `null` if unmigrated.
 */
export function resolveWeaponGlbUrl(
  weaponId: WeaponId,
  baseOverride?: string
): string | null {
  const cfg = GLB_WEAPON_CONFIGS[weaponId];
  if (!cfg) return null;
  return resolveModelUrl(cfg.modelFile, baseOverride);
}

/**
 * Checks whether a 4×4 matrix is identity within `eps`.
 */
export function isIdentityMatrix(m: THREE.Matrix4, eps = 1e-6): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(e[i] - IDENTITY_ELEMENTS[i]) > eps) {
      return false;
    }
  }
  return true;
}

/**
 * Matches a glTF node or mesh name against requested weapon `partId`s, tolerating
 * Blender duplicate suffixes (`.001`, `001`, `_1`) without false-positive partial matches.
 */
export function matchGlbNodeToPartId(
  rawName: string | undefined,
  candidateIds: ReadonlySet<string>
): string | null {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  if (candidateIds.has(trimmed)) return trimmed;

  const strippedDot = trimmed.replace(/\.\d{3}$/, '');
  if (strippedDot !== trimmed && candidateIds.has(strippedDot)) {
    return strippedDot;
  }

  const strippedUnderscore = trimmed.replace(/_\d+$/, '');
  if (strippedUnderscore !== trimmed && candidateIds.has(strippedUnderscore)) {
    return strippedUnderscore;
  }

  // Three.js PropertyBinding.sanitizeNodeName strips '.' turning `part.001` into `part001`
  const strippedSanitized = trimmed.replace(/00\d$/, '');
  if (strippedSanitized !== trimmed && candidateIds.has(strippedSanitized)) {
    return strippedSanitized;
  }

  return null;
}

function flipTriangleWinding(geo: THREE.BufferGeometry): void {
  const idx = geo.getIndex();
  if (idx) {
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      idx.setX(i + 1, c);
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
    return;
  }

  const attrNames = Object.keys(geo.attributes);
  const pos = geo.getAttribute('position');
  if (!pos) return;
  for (const name of attrNames) {
    const attr = geo.getAttribute(name);
    if (!attr) continue;
    const itemSize = attr.itemSize;
    for (let i = 0; i + 2 < attr.count; i += 3) {
      for (let k = 0; k < itemSize; k++) {
        const idxB = (i + 1) * itemSize + k;
        const idxC = (i + 2) * itemSize + k;
        const tmp = attr.array[idxB];
        (attr.array as Float32Array)[idxB] = attr.array[idxC];
        (attr.array as Float32Array)[idxC] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
}

function normalizeGeometryCoreAttributes(
  rawGeo: THREE.BufferGeometry,
  nodeMatrix?: THREE.Matrix4 | null
): THREE.BufferGeometry | null {
  const srcPos = rawGeo.getAttribute('position');
  if (!srcPos || srcPos.count < 3) return null;
  const vertCount = srcPos.count;

  const geo = new THREE.BufferGeometry();

  // 1. Owned Float32 position buffer (de-interleaves / de-quantizes Draco outputs safely)
  const posArr = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    const x = srcPos.getX(i);
    const y = srcPos.getY(i);
    const z = srcPos.getZ(i);
    posArr[i * 3] = Number.isFinite(x) ? x : 0;
    posArr[i * 3 + 1] = Number.isFinite(y) ? y : 0;
    posArr[i * 3 + 2] = Number.isFinite(z) ? z : 0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  // Preserve index buffer if present
  const srcIdx = rawGeo.getIndex();
  if (srcIdx && srcIdx.count >= 3) {
    const needsUint32 = vertCount > 65535;
    const idxArr = needsUint32
      ? new Uint32Array(srcIdx.count)
      : new Uint16Array(srcIdx.count);
    for (let i = 0; i < srcIdx.count; i++) {
      idxArr[i] = srcIdx.getX(i);
    }
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  }

  // 2. Owned finite unit-length Float32 normals (computed if absent)
  const srcNorm = rawGeo.getAttribute('normal');
  if (srcNorm && srcNorm.count === vertCount) {
    const normArr = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      const nx = srcNorm.getX(i);
      const ny = srcNorm.getY(i);
      const nz = srcNorm.getZ(i);
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8 && Number.isFinite(len)) {
        normArr[i * 3] = nx / len;
        normArr[i * 3 + 1] = ny / len;
        normArr[i * 3 + 2] = nz / len;
      } else {
        normArr[i * 3] = 0;
        normArr[i * 3 + 1] = 1;
        normArr[i * 3 + 2] = 0;
      }
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  } else {
    geo.computeVertexNormals();
  }

  // 3. Owned Float32 UVs with glTF V-axis flipped (`v_three = 1 - v_gltf = v_blender`)
  //    so `pbrManager`'s `TextureLoader(flipY = true)` samples upright WebPs identically.
  const srcUv = rawGeo.getAttribute('uv');
  const uvArr = new Float32Array(vertCount * 2);
  if (srcUv && srcUv.count === vertCount) {
    for (let i = 0; i < vertCount; i++) {
      const u = srcUv.getX(i);
      const v = srcUv.getY(i);
      uvArr[i * 2] = Number.isFinite(u) ? u : 0;
      uvArr[i * 2 + 1] = Number.isFinite(v) ? 1 - v : 0;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  // 4. Owned linear RGB `color` attribute (preserves glTF COLOR_0 if authored, else neutral steel)
  const srcColor = rawGeo.getAttribute('color');
  const colorArr = new Float32Array(vertCount * 3);
  if (srcColor && srcColor.count === vertCount && srcColor.itemSize >= 3) {
    for (let i = 0; i < vertCount; i++) {
      const r = srcColor.getX(i);
      const g = srcColor.getY(i);
      const b = srcColor.getZ(i);
      colorArr[i * 3] = Number.isFinite(r) ? r : DEFAULT_LINEAR_COLOR_R;
      colorArr[i * 3 + 1] = Number.isFinite(g) ? g : DEFAULT_LINEAR_COLOR_G;
      colorArr[i * 3 + 2] = Number.isFinite(b) ? b : DEFAULT_LINEAR_COLOR_B;
    }
  } else {
    for (let i = 0; i < vertCount; i++) {
      colorArr[i * 3] = DEFAULT_LINEAR_COLOR_R;
      colorArr[i * 3 + 1] = DEFAULT_LINEAR_COLOR_G;
      colorArr[i * 3 + 2] = DEFAULT_LINEAR_COLOR_B;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

  // Preserve MikkTSpace tangents if exported (glTF bitangent `cross(N, T) * T.w` already aligns with +V_blender)
  const srcTangent = rawGeo.getAttribute('tangent');
  if (
    srcTangent &&
    srcTangent.count === vertCount &&
    srcTangent.itemSize === 4
  ) {
    const tanArr = new Float32Array(vertCount * 4);
    for (let i = 0; i < vertCount; i++) {
      const tx = srcTangent.getX(i);
      const ty = srcTangent.getY(i);
      const tz = srcTangent.getZ(i);
      const tw = srcTangent.getW(i);
      const len = Math.hypot(tx, ty, tz);
      if (len > 1e-8 && Number.isFinite(len) && Number.isFinite(tw)) {
        tanArr[i * 4] = tx / len;
        tanArr[i * 4 + 1] = ty / len;
        tanArr[i * 4 + 2] = tz / len;
        tanArr[i * 4 + 3] = tw < 0 ? -1 : 1;
      } else {
        tanArr[i * 4] = 1;
        tanArr[i * 4 + 1] = 0;
        tanArr[i * 4 + 2] = 0;
        tanArr[i * 4 + 3] = 1;
      }
    }
    geo.setAttribute('tangent', new THREE.BufferAttribute(tanArr, 4));
  }

  // 5. Bake any non-identity node transform cleanly into vertices & normals
  if (nodeMatrix && !isIdentityMatrix(nodeMatrix)) {
    geo.applyMatrix4(nodeMatrix);
    if (nodeMatrix.determinant() < 0) {
      flipTriangleWinding(geo);
      const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < nAttr.count; i++) {
        nAttr.setXYZ(i, -nAttr.getX(i), -nAttr.getY(i), -nAttr.getZ(i));
      }
      nAttr.needsUpdate = true;
    }
    const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nAttr.count; i++) {
      const nx = nAttr.getX(i);
      const ny = nAttr.getY(i);
      const nz = nAttr.getZ(i);
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8 && Number.isFinite(len)) {
        nAttr.setXYZ(i, nx / len, ny / len, nz / len);
      } else {
        nAttr.setXYZ(i, 0, 1, 0);
      }
    }
    nAttr.needsUpdate = true;
  }

  return geo;
}

/**
 * Prepares a single extracted GLB mesh `BufferGeometry` for Digital Armory 3D:
 * bakes non-identity transforms, flips glTF `UV.y` to `1 - v`, guarantees `normal` / `uv` /
 * linear `color` attributes, computes `aCurvature`, marks `userData.isGlbAsset = true`,
 * and computes tight bounding box & sphere.
 */
export function prepareGlbPartGeometry(
  rawGeo: THREE.BufferGeometry,
  nodeMatrix?: THREE.Matrix4 | null
): THREE.BufferGeometry | null {
  const geo = normalizeGeometryCoreAttributes(rawGeo, nodeMatrix);
  if (!geo) return null;

  attachCurvatureAttribute(geo, false);
  geo.userData = { ...geo.userData, isGlbAsset: true };
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function prepareMergedGlbGroupGeometry(
  meshes: readonly THREE.Mesh[]
): THREE.BufferGeometry | null {
  const preparedList: THREE.BufferGeometry[] = [];
  let allHaveTangent = true;

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    const core = normalizeGeometryCoreAttributes(
      mesh.geometry,
      mesh.matrixWorld
    );
    if (!core) continue;
    const nonIndexed = core.index ? core.toNonIndexed() : core;
    if (nonIndexed !== core) core.dispose();
    if (!nonIndexed.hasAttribute('tangent')) {
      allHaveTangent = false;
    }
    preparedList.push(nonIndexed);
  }

  if (preparedList.length === 0) return null;
  if (preparedList.length === 1) {
    const single = preparedList[0];
    attachCurvatureAttribute(single, false);
    single.userData = { ...single.userData, isGlbAsset: true };
    single.computeBoundingBox();
    single.computeBoundingSphere();
    return single;
  }

  if (!allHaveTangent) {
    for (let i = 0; i < preparedList.length; i++) {
      preparedList[i].deleteAttribute('tangent');
    }
  }

  const merged = mergeGeometries(preparedList, false);
  for (let i = 0; i < preparedList.length; i++) {
    preparedList[i].dispose();
  }
  if (!merged) return null;

  attachCurvatureAttribute(merged, false);
  merged.userData = { ...merged.userData, isGlbAsset: true };
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material)
        ? obj.material
        : obj.material
          ? [obj.material]
          : [];
      for (const mat of mats) {
        if (!mat) continue;
        for (const val of Object.values(mat)) {
          if (val instanceof THREE.Texture) {
            val.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

/**
 * Extracts all requested non-spring part geometries from a parsed glTF scene graph,
 * preserving dynamic spring exclusion and multi-primitive group merging.
 */
export function extractPartGeometriesFromGltfScene(
  scene: THREE.Object3D,
  weaponId: WeaponId,
  requestedPartIds: readonly string[]
): Map<string, THREE.BufferGeometry> {
  const extracted = new Map<string, THREE.BufferGeometry>();
  const candidateIds = new Set<string>();
  for (let i = 0; i < requestedPartIds.length; i++) {
    const id = requestedPartIds[i];
    if (!isGlbDynamicSpringPart(weaponId, id)) {
      candidateIds.add(id);
    }
  }
  if (candidateIds.size === 0) return extracted;

  scene.updateMatrixWorld(true);

  const visit = (obj: THREE.Object3D): void => {
    const meshGeoName =
      obj instanceof THREE.Mesh ? obj.geometry?.name : undefined;
    const matchedId =
      matchGlbNodeToPartId(obj.name, candidateIds) ??
      matchGlbNodeToPartId(meshGeoName, candidateIds);

    if (matchedId && !extracted.has(matchedId)) {
      if (
        obj instanceof THREE.Mesh &&
        obj.geometry instanceof THREE.BufferGeometry
      ) {
        const prepared = prepareGlbPartGeometry(obj.geometry, obj.matrixWorld);
        if (prepared) {
          extracted.set(matchedId, prepared);
        }
        return;
      }

      const childMeshes: THREE.Mesh[] = [];
      obj.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.geometry instanceof THREE.BufferGeometry
        ) {
          childMeshes.push(child);
        }
      });
      if (childMeshes.length > 0) {
        const prepared = prepareMergedGlbGroupGeometry(childMeshes);
        if (prepared) {
          extracted.set(matchedId, prepared);
        }
        return;
      }
    }

    for (let i = 0; i < obj.children.length; i++) {
      visit(obj.children[i]);
    }
  };

  visit(scene);
  return extracted;
}

function getBrowserGltfLoader(): GLTFLoader {
  const decoderPath = resolveDracoDecoderPath();
  if (!cachedDracoLoader) {
    cachedDracoLoader = new DRACOLoader();
    cachedDracoLoader.setWorkerLimit(2);
    cachedDracoLoader.setDecoderPath(decoderPath);
    cachedDracoDecoderPath = decoderPath;
  } else if (cachedDracoDecoderPath !== decoderPath) {
    cachedDracoLoader.setDecoderPath(decoderPath);
    cachedDracoDecoderPath = decoderPath;
  }

  if (!cachedBrowserGltfLoader) {
    cachedBrowserGltfLoader = new GLTFLoader();
    cachedBrowserGltfLoader.setDRACOLoader(cachedDracoLoader);
  }
  return cachedBrowserGltfLoader;
}

/**
 * Parses an in-memory `.glb` `ArrayBuffer` and extracts prepared `BufferGeometry` entries
 * for the requested non-spring parts. Works both in browser (with Draco) and headless Node
 * (for uncompressed glTF/GLB test fixtures).
 */
export async function parseGlbArrayBuffer(
  buffer: ArrayBuffer,
  weaponId: WeaponId,
  requestedPartIds: readonly string[],
  options?: { useDraco?: boolean }
): Promise<Map<string, THREE.BufferGeometry>> {
  const useDraco = options?.useDraco ?? typeof window !== 'undefined';
  const loader = useDraco ? getBrowserGltfLoader() : new GLTFLoader();

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    loader.parse(buffer, '', resolve, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  try {
    return extractPartGeometriesFromGltfScene(
      gltf.scene,
      weaponId,
      requestedPartIds
    );
  } finally {
    disposeObjectTree(gltf.scene);
  }
}

/**
 * Browser-only Draco GLB loader for migrated flagship exhibits (`p08`, `ak15`, `deagle`, `m4a1`, `python`).
 * Automatically skips dynamic springs, returns an empty `Map` in headless Node or for
 * unmigrated weapons, and swallows network/decode failures so `geometryService.ts`
 * cleanly falls back to the CSG Web Worker with zero interruption.
 */
export async function loadWeaponGlbGeometries(
  weaponId: WeaponId,
  requestedPartIds: readonly string[]
): Promise<Map<string, THREE.BufferGeometry>> {
  if (typeof window === 'undefined') {
    return new Map();
  }

  const url = resolveWeaponGlbUrl(weaponId);
  if (!url) {
    return new Map();
  }

  const nonSpringIds = requestedPartIds.filter(
    (id) => !isGlbDynamicSpringPart(weaponId, id)
  );
  if (nonSpringIds.length === 0) {
    return new Map();
  }

  try {
    const loader = getBrowserGltfLoader();
    const gltf = await loader.loadAsync(url);
    try {
      return extractPartGeometriesFromGltfScene(
        gltf.scene,
        weaponId,
        nonSpringIds
      );
    } finally {
      disposeObjectTree(gltf.scene);
    }
  } catch (err) {
    console.warn(
      `[glbAssetService] Failed to load "${url}" for "${weaponId}", falling back to CSG Worker:`,
      err
    );
    return new Map();
  }
}

/**
 * Releases singleton `DRACOLoader` worker pool resources (primarily for clean teardown/tests).
 */
export function disposeGlbLoaderResources(): void {
  if (cachedDracoLoader) {
    cachedDracoLoader.dispose();
    cachedDracoLoader = null;
  }
  cachedBrowserGltfLoader = null;
  cachedDracoDecoderPath = '';
}

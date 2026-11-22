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

const BENELLIM4_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'benellim4_v3_receiver_albedo.webp',
  normalFile: 'benellim4_v3_receiver_normal.webp',
  roughnessFile: 'benellim4_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const BENELLIM4_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'benellim4_v3_metal_albedo.webp',
  normalFile: 'benellim4_v3_metal_normal.webp',
  roughnessFile: 'benellim4_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const BENELLIM4_V3_FURNITURE_PBR: PbrBindingSpec = {
  albedoFile: 'benellim4_v3_furniture_albedo.webp',
  normalFile: 'benellim4_v3_furniture_normal.webp',
  roughnessFile: 'benellim4_v3_furniture_roughness.webp',
  normalScale: 0.9,
};

const M249_V3_RECEIVER_PBR: PbrBindingSpec = {
  albedoFile: 'm249_v3_receiver_albedo.webp',
  normalFile: 'm249_v3_receiver_normal.webp',
  roughnessFile: 'm249_v3_receiver_roughness.webp',
  normalScale: 0.88,
};

const M249_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'm249_v3_metal_albedo.webp',
  normalFile: 'm249_v3_metal_normal.webp',
  roughnessFile: 'm249_v3_metal_roughness.webp',
  normalScale: 0.85,
};

const M249_V3_FURNITURE_PBR: PbrBindingSpec = {
  albedoFile: 'm249_v3_furniture_albedo.webp',
  normalFile: 'm249_v3_furniture_normal.webp',
  roughnessFile: 'm249_v3_furniture_roughness.webp',
  normalScale: 0.9,
};

const VECTOR_V3_HOUSING_PBR: PbrBindingSpec = {
  albedoFile: 'vector_v3_housing_albedo.webp',
  normalFile: 'vector_v3_housing_normal.webp',
  roughnessFile: 'vector_v3_housing_roughness.webp',
  normalScale: 0.88,
};

const VECTOR_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'vector_v3_metal_albedo.webp',
  normalFile: 'vector_v3_metal_normal.webp',
  roughnessFile: 'vector_v3_metal_roughness.webp',
  normalScale: 0.82,
};

const VECTOR_V3_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'vector_v3_mag_albedo.webp',
  normalFile: 'vector_v3_mag_normal.webp',
  roughnessFile: 'vector_v3_mag_roughness.webp',
  normalScale: 0.86,
};

const LIFT33_V3_RISER_PBR: PbrBindingSpec = {
  albedoFile: 'lift33_v3_riser_albedo.webp',
  normalFile: 'lift33_v3_riser_normal.webp',
  roughnessFile: 'lift33_v3_riser_roughness.webp',
  normalScale: 0.88,
};

const LIFT33_V3_CAMS_ACC_PBR: PbrBindingSpec = {
  albedoFile: 'lift33_v3_cams_acc_albedo.webp',
  normalFile: 'lift33_v3_cams_acc_normal.webp',
  roughnessFile: 'lift33_v3_cams_acc_roughness.webp',
  normalScale: 0.85,
};

const LIFT33_V3_QUIVER_ARROW_PBR: PbrBindingSpec = {
  albedoFile: 'lift33_v3_quiver_arrow_albedo.webp',
  normalFile: 'lift33_v3_quiver_arrow_normal.webp',
  roughnessFile: 'lift33_v3_quiver_arrow_roughness.webp',
  normalScale: 0.88,
};

const R500_V3_CHASSIS_PBR: PbrBindingSpec = {
  albedoFile: 'r500_v3_chassis_albedo.webp',
  normalFile: 'r500_v3_chassis_normal.webp',
  roughnessFile: 'r500_v3_chassis_roughness.webp',
  normalScale: 0.88,
};

const R500_V3_CAMS_MECH_PBR: PbrBindingSpec = {
  albedoFile: 'r500_v3_cams_mech_albedo.webp',
  normalFile: 'r500_v3_cams_mech_normal.webp',
  roughnessFile: 'r500_v3_cams_mech_roughness.webp',
  normalScale: 0.86,
};

const R500_V3_OPTIC_BOLT_PBR: PbrBindingSpec = {
  albedoFile: 'r500_v3_optic_bolt_albedo.webp',
  normalFile: 'r500_v3_optic_bolt_normal.webp',
  roughnessFile: 'r500_v3_optic_bolt_roughness.webp',
  normalScale: 0.85,
};

const G11_V3_HOUSING_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_housing_albedo.webp',
  normalFile: 'g11_v3_housing_normal.webp',
  roughnessFile: 'g11_v3_housing_roughness.webp',
  normalScale: 0.88,
};

const G11_V3_CLOCKWORK_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_clockwork_albedo.webp',
  normalFile: 'g11_v3_clockwork_normal.webp',
  roughnessFile: 'g11_v3_clockwork_roughness.webp',
  normalScale: 0.85,
};

const G11_V3_BARREL_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'g11_v3_barrel_mag_albedo.webp',
  normalFile: 'g11_v3_barrel_mag_normal.webp',
  roughnessFile: 'g11_v3_barrel_mag_roughness.webp',
  normalScale: 0.86,
};

const VSS_V3_RECEIVER_SUPP_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_receiver_supp_albedo.webp',
  normalFile: 'vss_v3_receiver_supp_normal.webp',
  roughnessFile: 'vss_v3_receiver_supp_roughness.webp',
  normalScale: 0.88,
};

const VSS_V3_WOOD_OPTIC_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_wood_optic_albedo.webp',
  normalFile: 'vss_v3_wood_optic_normal.webp',
  roughnessFile: 'vss_v3_wood_optic_roughness.webp',
  normalScale: 0.9,
};

const VSS_V3_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'vss_v3_metal_albedo.webp',
  normalFile: 'vss_v3_metal_normal.webp',
  roughnessFile: 'vss_v3_metal_roughness.webp',
  normalScale: 0.84,
};

const M134_V3_HOUSING_MOTOR_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_housing_motor_albedo.webp',
  normalFile: 'm134_v3_housing_motor_normal.webp',
  roughnessFile: 'm134_v3_housing_motor_roughness.webp',
  normalScale: 0.88,
};

const M134_V3_BARRELS_ROTOR_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_barrels_rotor_albedo.webp',
  normalFile: 'm134_v3_barrels_rotor_normal.webp',
  roughnessFile: 'm134_v3_barrels_rotor_roughness.webp',
  normalScale: 0.85,
};

const M134_V3_DELINKER_BOLTS_PBR: PbrBindingSpec = {
  albedoFile: 'm134_v3_delinker_bolts_albedo.webp',
  normalFile: 'm134_v3_delinker_bolts_normal.webp',
  roughnessFile: 'm134_v3_delinker_bolts_roughness.webp',
  normalScale: 0.86,
};

const AN94_V3_RECEIVER_STOCK_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_receiver_stock_albedo.webp',
  normalFile: 'an94_v3_receiver_stock_normal.webp',
  roughnessFile: 'an94_v3_receiver_stock_roughness.webp',
  normalScale: 0.9,
};

const AN94_V3_PULLEY_METAL_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_pulley_metal_albedo.webp',
  normalFile: 'an94_v3_pulley_metal_normal.webp',
  roughnessFile: 'an94_v3_pulley_metal_roughness.webp',
  normalScale: 0.85,
};

const AN94_V3_BARREL_MAG_PBR: PbrBindingSpec = {
  albedoFile: 'an94_v3_barrel_mag_albedo.webp',
  normalFile: 'an94_v3_barrel_mag_normal.webp',
  roughnessFile: 'an94_v3_barrel_mag_roughness.webp',
  normalScale: 0.88,
};

const ZTZ99A_V3_ARMOR_HULL_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_armor_hull_albedo.webp',
  normalFile: 'ztz99a_v3_armor_hull_normal.webp',
  roughnessFile: 'ztz99a_v3_armor_hull_roughness.webp',
  normalScale: 1.24,
};

const ZTZ99A_V3_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_turret_gun_albedo.webp',
  normalFile: 'ztz99a_v3_turret_gun_normal.webp',
  roughnessFile: 'ztz99a_v3_turret_gun_roughness.webp',
  normalScale: 1.22,
};

const ZTZ99A_V3_INTERIOR_POWER_PBR: PbrBindingSpec = {
  albedoFile: 'ztz99a_v3_interior_power_albedo.webp',
  normalFile: 'ztz99a_v3_interior_power_normal.webp',
  roughnessFile: 'ztz99a_v3_interior_power_roughness.webp',
  normalScale: 1.12,
};

const M1A2_V3_HULL_ARMOR_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_hull_armor_albedo.webp',
  normalFile: 'm1a2_v3_hull_armor_normal.webp',
  roughnessFile: 'm1a2_v3_hull_armor_roughness.webp',
  normalScale: 1.26,
};

const M1A2_V3_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_turret_gun_albedo.webp',
  normalFile: 'm1a2_v3_turret_gun_normal.webp',
  roughnessFile: 'm1a2_v3_turret_gun_roughness.webp',
  normalScale: 1.24,
};

const M1A2_V3_TURBINE_BUSTLE_PBR: PbrBindingSpec = {
  albedoFile: 'm1a2_v3_turbine_bustle_albedo.webp',
  normalFile: 'm1a2_v3_turbine_bustle_normal.webp',
  roughnessFile: 'm1a2_v3_turbine_bustle_roughness.webp',
  normalScale: 1.12,
};

const LEOPARD2A7_V3_HULL_CAMO_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_hull_camo_albedo.webp',
  normalFile: 'leopard2a7_v3_hull_camo_normal.webp',
  roughnessFile: 'leopard2a7_v3_hull_camo_roughness.webp',
  normalScale: 1.24,
};

const LEOPARD2A7_V3_TURRET_GUN_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_turret_gun_albedo.webp',
  normalFile: 'leopard2a7_v3_turret_gun_normal.webp',
  roughnessFile: 'leopard2a7_v3_turret_gun_roughness.webp',
  normalScale: 1.24,
};

const LEOPARD2A7_V3_POWERPACK_INT_PBR: PbrBindingSpec = {
  albedoFile: 'leopard2a7_v3_powerpack_int_albedo.webp',
  normalFile: 'leopard2a7_v3_powerpack_int_normal.webp',
  roughnessFile: 'leopard2a7_v3_powerpack_int_roughness.webp',
  normalScale: 1.12,
};

const TIGER1_V3_HULL_ZIMMERIT_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_hull_zimmerit_albedo.webp',
  normalFile: 'tiger1_v3_hull_zimmerit_normal.webp',
  roughnessFile: 'tiger1_v3_hull_zimmerit_roughness.webp',
  normalScale: 1.26,
};

const TIGER1_V3_TURRET_88MM_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_turret_88mm_albedo.webp',
  normalFile: 'tiger1_v3_turret_88mm_normal.webp',
  roughnessFile: 'tiger1_v3_turret_88mm_roughness.webp',
  normalScale: 1.24,
};

const TIGER1_V3_DRIVETRAIN_INT_PBR: PbrBindingSpec = {
  albedoFile: 'tiger1_v3_drivetrain_int_albedo.webp',
  normalFile: 'tiger1_v3_drivetrain_int_normal.webp',
  roughnessFile: 'tiger1_v3_drivetrain_int_roughness.webp',
  normalScale: 1.12,
};

export const GLB_WEAPON_CONFIGS: Readonly<
  Record<WeaponId, GlbWeaponAssetConfig>
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
  benellim4: {
    modelFile: 'benellim4.glb',
    dynamicSpringParts: [
      'benellim4_recoil_spring',
      'benellim4_hammer_spring',
      'benellim4_mag_spring',
    ],
    pbrOverrides: {
      // Type-III anodized 7075-T6 receiver, M1913 top rail, LPA ghost-ring sights & FCG housing (7 parts)
      benellim4_receiver: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_picatinny_rail: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_front_sight: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_rear_sight: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_trigger_housing: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_trigger: BENELLIM4_V3_RECEIVER_PBR,
      benellim4_safety_button: BENELLIM4_V3_RECEIVER_PBR,
      // 18.5" chrome-lined barrel, twin ARGO short-stroke pistons, rotating bolt, mag tube & elevator (12 parts)
      benellim4_barrel: BENELLIM4_V3_METAL_PBR,
      benellim4_argo_pistons: BENELLIM4_V3_METAL_PBR,
      benellim4_argo_plugs: BENELLIM4_V3_METAL_PBR,
      benellim4_bolt_carrier: BENELLIM4_V3_METAL_PBR,
      benellim4_bolt_head: BENELLIM4_V3_METAL_PBR,
      benellim4_cam_pin: BENELLIM4_V3_METAL_PBR,
      benellim4_firing_pin: BENELLIM4_V3_METAL_PBR,
      benellim4_charging_handle: BENELLIM4_V3_METAL_PBR,
      benellim4_hammer: BENELLIM4_V3_METAL_PBR,
      benellim4_mag_tube: BENELLIM4_V3_METAL_PBR,
      benellim4_mag_cap: BENELLIM4_V3_METAL_PBR,
      benellim4_shell_elevator: BENELLIM4_V3_METAL_PBR,
      // Two-piece ribbed nylon forend, notched recoil tube, M1014 skeleton telestock & follower (4 parts)
      benellim4_forend: BENELLIM4_V3_FURNITURE_PBR,
      benellim4_recoil_tube: BENELLIM4_V3_FURNITURE_PBR,
      benellim4_telestock: BENELLIM4_V3_FURNITURE_PBR,
      benellim4_mag_follower: BENELLIM4_V3_FURNITURE_PBR,
    },
  },
  m249: {
    modelFile: 'm249.glb',
    dynamicSpringParts: ['m249_recoil_spring', 'm249_sear_spring'],
    pbrOverrides: {
      // Stamped & welded steel receiver, hinged feed top cover, sights, feed tray & charging handle (6 parts)
      m249_receiver: M249_V3_RECEIVER_PBR,
      m249_top_cover: M249_V3_RECEIVER_PBR,
      m249_rear_sight: M249_V3_RECEIVER_PBR,
      m249_front_sight: M249_V3_RECEIVER_PBR,
      m249_feed_tray: M249_V3_RECEIVER_PBR,
      m249_charging_handle: M249_V3_RECEIVER_PBR,
      // Quick-change 18.3" barrel, gas regulator, piston carrier, 2-lug bolt, hydraulic buffer, bipod & M27 belt (13 parts)
      m249_barrel: M249_V3_METAL_PBR,
      m249_gas_regulator: M249_V3_METAL_PBR,
      m249_piston_carrier: M249_V3_METAL_PBR,
      m249_bolt: M249_V3_METAL_PBR,
      m249_firing_pin: M249_V3_METAL_PBR,
      m249_hydraulic_buffer: M249_V3_METAL_PBR,
      m249_gas_tube: M249_V3_METAL_PBR,
      m249_bipod: M249_V3_METAL_PBR,
      m249_trigger: M249_V3_METAL_PBR,
      m249_open_bolt_sear: M249_V3_METAL_PBR,
      m249_feed_lever: M249_V3_METAL_PBR,
      m249_feed_pawls: M249_V3_METAL_PBR,
      m249_m27_belt: M249_V3_METAL_PBR,
      // Carry handle, ventilated heat-shield handguard, Para/SAW buttstock, grip frame & 200-rd drum (5 parts)
      m249_barrel_handle: M249_V3_FURNITURE_PBR,
      m249_handguard: M249_V3_FURNITURE_PBR,
      m249_buttstock: M249_V3_FURNITURE_PBR,
      m249_trigger_frame: M249_V3_FURNITURE_PBR,
      m249_ammo_box: M249_V3_FURNITURE_PBR,
    },
  },
  vector: {
    modelFile: 'vector.glb',
    dynamicSpringParts: [
      'vector_recoil_spring',
      'vector_hammer_spring',
      'vector_mag_spring',
    ],
    pbrOverrides: {
      // Two-tone Combat FDE / Charcoal Super V upper/lower chassis, folding stock, sights & controls (7 parts)
      vector_upper_housing: VECTOR_V3_HOUSING_PBR,
      vector_lower_chassis: VECTOR_V3_HOUSING_PBR,
      vector_folding_stock: VECTOR_V3_HOUSING_PBR,
      vector_front_sight: VECTOR_V3_HOUSING_PBR,
      vector_rear_sight: VECTOR_V3_HOUSING_PBR,
      vector_fire_selector: VECTOR_V3_HOUSING_PBR,
      vector_thumb_safety: VECTOR_V3_HOUSING_PBR,
      // Low-bore 5.5" barrel, Super V off-axis cam slider, .45 ACP bolt, brass-knuckle handle & inverted FCG (12 parts)
      vector_barrel: VECTOR_V3_METAL_PBR,
      vector_muzzle_device: VECTOR_V3_METAL_PBR,
      vector_bolt: VECTOR_V3_METAL_PBR,
      vector_firing_pin: VECTOR_V3_METAL_PBR,
      vector_slider: VECTOR_V3_METAL_PBR,
      vector_guide_rod: VECTOR_V3_METAL_PBR,
      vector_charging_handle: VECTOR_V3_METAL_PBR,
      vector_takedown_pins: VECTOR_V3_METAL_PBR,
      vector_stock_hinge: VECTOR_V3_METAL_PBR,
      vector_fcu_chassis: VECTOR_V3_METAL_PBR,
      vector_trigger: VECTOR_V3_METAL_PBR,
      vector_hammer: VECTOR_V3_METAL_PBR,
      // 66° canted MagEx2 25-round .45 ACP extended magazine, high-vis orange follower & baseplate (3 parts)
      vector_mag_body: VECTOR_V3_MAG_PBR,
      vector_mag_follower: VECTOR_V3_MAG_PBR,
      vector_mag_baseplate: VECTOR_V3_MAG_PBR,
    },
  },
  lift33: {
    modelFile: 'lift33.glb',
    dynamicSpringParts: [
      'lift33_upper_limbs',
      'lift33_lower_limbs',
      'lift33_cam_axles',
      'lift33_bowstring',
      'lift33_yoke_cables',
    ],
    pbrOverrides: {
      // Skeletonized bridged 6061-T6 aluminum truss riser, Engage grip, limb pockets, roller guard & 10" stabilizer (6 parts)
      lift33_riser: LIFT33_V3_RISER_PBR,
      lift33_grip: LIFT33_V3_RISER_PBR,
      lift33_upper_pocket: LIFT33_V3_RISER_PBR,
      lift33_lower_pocket: LIFT33_V3_RISER_PBR,
      lift33_cable_guard: LIFT33_V3_RISER_PBR,
      lift33_stabilizer: LIFT33_V3_RISER_PBR,
      // SwitchWeight-X binary cams, harmonic dampeners, QAD drop-away rest, Bridge-Lock fiber-optic sight & D-loop (8 parts)
      lift33_upper_cam: LIFT33_V3_CAMS_ACC_PBR,
      lift33_lower_cam: LIFT33_V3_CAMS_ACC_PBR,
      lift33_limb_dampeners: LIFT33_V3_CAMS_ACC_PBR,
      lift33_drop_away_rest: LIFT33_V3_CAMS_ACC_PBR,
      lift33_launcher_fork: LIFT33_V3_CAMS_ACC_PBR,
      lift33_sight_housing: LIFT33_V3_CAMS_ACC_PBR,
      lift33_sight_pins: LIFT33_V3_CAMS_ACC_PBR,
      lift33_d_loop: LIFT33_V3_CAMS_ACC_PBR,
      // LowPro 3K carbon 5-arrow quiver, hood, latch, 29" 300-spine carbon hunting arrow & 3-blade broadhead (5 parts)
      lift33_quiver_frame: LIFT33_V3_QUIVER_ARROW_PBR,
      lift33_quiver_hood: LIFT33_V3_QUIVER_ARROW_PBR,
      lift33_quiver_latch: LIFT33_V3_QUIVER_ARROW_PBR,
      lift33_arrow_shaft: LIFT33_V3_QUIVER_ARROW_PBR,
      lift33_broadhead: LIFT33_V3_QUIVER_ARROW_PBR,
    },
  },
  r500: {
    modelFile: 'r500.glb',
    dynamicSpringParts: [
      'r500_left_limbs',
      'r500_right_limbs',
      'r500_cam_axles',
      'r500_bowstring',
      'r500_power_cables',
      'r500_trigger_spring',
    ],
    pbrOverrides: {
      // Slate-grey CNC bullpup chassis, forend, pistol grip, buttstock, floating flight rail & riser head (6 parts)
      r500_chassis: R500_V3_CHASSIS_PBR,
      r500_forend_grip: R500_V3_CHASSIS_PBR,
      r500_pistol_grip: R500_V3_CHASSIS_PBR,
      r500_buttstock: R500_V3_CHASSIS_PBR,
      r500_flight_rail: R500_V3_CHASSIS_PBR,
      r500_riser_head: R500_V3_CHASSIS_PBR,
      // Dual 360° HexCoil helical cams, VersaDrive internal lead-screw, sliding Trac-Trigger sled & ADF sear (9 parts)
      r500_left_cam: R500_V3_CAMS_MECH_PBR,
      r500_right_cam: R500_V3_CAMS_MECH_PBR,
      r500_foot_stirrup: R500_V3_CAMS_MECH_PBR,
      r500_versadrive_screw: R500_V3_CAMS_MECH_PBR,
      r500_trigger_sled: R500_V3_CAMS_MECH_PBR,
      r500_string_latch: R500_V3_CAMS_MECH_PBR,
      r500_anti_dry_fire: R500_V3_CAMS_MECH_PBR,
      r500_trigger_sear: R500_V3_CAMS_MECH_PBR,
      r500_safety_selector: R500_V3_CAMS_MECH_PBR,
      // Illuminated 100-yard speed-ring crossbow scope, side quiver, spring retention arm & 400gr carbon bolt (4 parts)
      r500_scope: R500_V3_OPTIC_BOLT_PBR,
      r500_quiver_frame: R500_V3_OPTIC_BOLT_PBR,
      r500_retention_arm: R500_V3_OPTIC_BOLT_PBR,
      r500_carbon_bolt: R500_V3_OPTIC_BOLT_PBR,
    },
  },
  g11: {
    modelFile: 'g11.glb',
    dynamicSpringParts: ['g11_recoil_spring', 'g11_mag_spring'],
    pbrOverrides: {
      // Bundeswehr olive-charcoal monocoque polymer casing, Hensoldt 1x/3.5x optic, grip, buttplate, winding knob, selector & spare clips (7 parts)
      g11_outer_housing: G11_V3_HOUSING_PBR,
      g11_optic_handle: G11_V3_HOUSING_PBR,
      g11_pistol_grip: G11_V3_HOUSING_PBR,
      g11_buttplate: G11_V3_HOUSING_PBR,
      g11_winding_knob: G11_V3_HOUSING_PBR,
      g11_selector: G11_V3_HOUSING_PBR,
      g11_spare_clips: G11_V3_HOUSING_PBR,
      // Floating CNC inner receiver, 90° chrome rotary breech, Swiss-watch spur gears, rack, gas piston, rammer, firing pin, buffer & FCU (9 parts)
      g11_inner_receiver: G11_V3_CLOCKWORK_PBR,
      g11_rotary_breech: G11_V3_CLOCKWORK_PBR,
      g11_clockwork_gears: G11_V3_CLOCKWORK_PBR,
      g11_driving_rod: G11_V3_CLOCKWORK_PBR,
      g11_gas_piston: G11_V3_CLOCKWORK_PBR,
      g11_loading_rammer: G11_V3_CLOCKWORK_PBR,
      g11_firing_pin: G11_V3_CLOCKWORK_PBR,
      g11_buffer_assembly: G11_V3_CLOCKWORK_PBR,
      g11_trigger_pack: G11_V3_CLOCKWORK_PBR,
      // 540mm floating barrel, 6-slot flash hider, curved steel trigger, overhead 45-rd DM11 mag tube, orange follower & twist-lock endcap (6 parts)
      g11_barrel: G11_V3_BARREL_MAG_PBR,
      g11_flash_hider: G11_V3_BARREL_MAG_PBR,
      g11_trigger: G11_V3_BARREL_MAG_PBR,
      g11_mag_tube: G11_V3_BARREL_MAG_PBR,
      g11_mag_follower: G11_V3_BARREL_MAG_PBR,
      g11_mag_endcap: G11_V3_BARREL_MAG_PBR,
    },
  },
  vss: {
    modelFile: 'vss.glb',
    dynamicSpringParts: ['vss_recoil_spring', 'vss_striker_spring'],
    pbrOverrides: {
      // TOZ CNC-milled blued steel receiver, 3-rib dust cover, 414mm integral suppressor tube, 400m sight, plum forend, safety & cross-bolt selector (7 parts)
      vss_receiver: VSS_V3_RECEIVER_SUPP_PBR,
      vss_dust_cover: VSS_V3_RECEIVER_SUPP_PBR,
      vss_suppressor_tube: VSS_V3_RECEIVER_SUPP_PBR,
      vss_rear_sight: VSS_V3_RECEIVER_SUPP_PBR,
      vss_forend: VSS_V3_RECEIVER_SUPP_PBR,
      vss_safety_lever: VSS_V3_RECEIVER_SUPP_PBR,
      vss_selector_switch: VSS_V3_RECEIVER_SUPP_PBR,
      // Russian laminated birchwood skeleton stock, PSO-1M2-1 4x24 scope (firewalled lenses), 10-rd plum waffle mag & safety-orange follower (4 parts)
      vss_wood_stock: VSS_V3_WOOD_OPTIC_PBR,
      vss_pso1_scope: VSS_V3_WOOD_OPTIC_PBR,
      vss_mag_body: VSS_V3_WOOD_OPTIC_PBR,
      vss_mag_follower: VSS_V3_WOOD_OPTIC_PBR,
      // 200mm radial-ported barrel, 6-stage slanted CNC baffle stack, long-stroke BCG, 6-lug bolt, linear striker, internals & static mag spring/floorplate (11 parts)
      vss_barrel: VSS_V3_METAL_PBR,
      vss_baffle_stack: VSS_V3_METAL_PBR,
      vss_bolt_carrier: VSS_V3_METAL_PBR,
      vss_bolt: VSS_V3_METAL_PBR,
      vss_firing_pin: VSS_V3_METAL_PBR,
      vss_recoil_guide: VSS_V3_METAL_PBR,
      vss_striker: VSS_V3_METAL_PBR,
      vss_trigger: VSS_V3_METAL_PBR,
      vss_sear: VSS_V3_METAL_PBR,
      vss_mag_spring: VSS_V3_METAL_PBR,
      vss_mag_floorplate: VSS_V3_METAL_PBR,
    },
  },
  m134: {
    modelFile: 'm134.glb',
    dynamicSpringParts: ['m134_clutch_spring', 'm134_feeder_spring'],
    pbrOverrides: {
      // Heavy ribbed cylindrical housing w/ stencil & UID, 360° sinusoidal cam sleeve, 28V DC copper-wound motor, gearbox, spade grip, handle & pintle (7 parts)
      m134_main_housing: M134_V3_HOUSING_MOTOR_PBR,
      m134_cam_track_ring: M134_V3_HOUSING_MOTOR_PBR,
      m134_drive_motor: M134_V3_HOUSING_MOTOR_PBR,
      m134_gear_housing: M134_V3_HOUSING_MOTOR_PBR,
      m134_spade_grip: M134_V3_HOUSING_MOTOR_PBR,
      m134_carry_handle: M134_V3_HOUSING_MOTOR_PBR,
      m134_mount_pintle: M134_V3_HOUSING_MOTOR_PBR,
      // 6-barrel 22" cluster, dual barrel clamp, heat-tempered 6-tube flash suppressor, CNC star-rotor, 28-tooth drive gear & SAFE/ARMED safing sector (6 parts)
      m134_barrel_cluster: M134_V3_BARRELS_ROTOR_PBR,
      m134_barrel_clamp: M134_V3_BARRELS_ROTOR_PBR,
      m134_flash_suppressor: M134_V3_BARRELS_ROTOR_PBR,
      m134_rotor_assembly: M134_V3_BARRELS_ROTOR_PBR,
      m134_drive_gear: M134_V3_BARRELS_ROTOR_PBR,
      m134_safing_sector: M134_V3_BARRELS_ROTOR_PBR,
      // 6 hard-chrome roller bolts, Dillon Aero delinker feeder & 6-pocket star-wheel, flexible stainless 7.62 NATO ammo chute & lower-right ejection chute (10 parts)
      m134_bolt_1: M134_V3_DELINKER_BOLTS_PBR,
      m134_bolt_2: M134_V3_DELINKER_BOLTS_PBR,
      m134_bolt_3: M134_V3_DELINKER_BOLTS_PBR,
      m134_bolt_4: M134_V3_DELINKER_BOLTS_PBR,
      m134_bolt_5: M134_V3_DELINKER_BOLTS_PBR,
      m134_bolt_6: M134_V3_DELINKER_BOLTS_PBR,
      m134_delinker_housing: M134_V3_DELINKER_BOLTS_PBR,
      m134_delinker_sprocket: M134_V3_DELINKER_BOLTS_PBR,
      m134_ammo_chute: M134_V3_DELINKER_BOLTS_PBR,
      m134_ejection_chute: M134_V3_DELINKER_BOLTS_PBR,
    },
  },
  an94: {
    modelFile: 'an94.glb',
    dynamicSpringParts: ['an94_recoil_spring', 'an94_receiver_buffer_spring'],
    pbrOverrides: {
      // Izhmash monocoque polyamide housing, ribbed dust cover, right-folding buttstock, checkered grip, 5-pos star-wheel sight, thumb safety & 3-mode selector (7 parts)
      an94_outer_housing: AN94_V3_RECEIVER_STOCK_PBR,
      an94_dust_cover: AN94_V3_RECEIVER_STOCK_PBR,
      an94_buttstock: AN94_V3_RECEIVER_STOCK_PBR,
      an94_pistol_grip: AN94_V3_RECEIVER_STOCK_PBR,
      an94_rear_sight: AN94_V3_RECEIVER_STOCK_PBR,
      an94_safety_switch: AN94_V3_RECEIVER_STOCK_PBR,
      an94_fire_selector: AN94_V3_RECEIVER_STOCK_PBR,
      // Floating steel sub-receiver, BCG, 2-lug bolt, firing pin, CNC V-groove pulley, braided steel cable, bronze 2-stage rammer, guide, hammer & trigger (10 parts)
      an94_inner_receiver: AN94_V3_PULLEY_METAL_PBR,
      an94_bolt_carrier: AN94_V3_PULLEY_METAL_PBR,
      an94_bolt: AN94_V3_PULLEY_METAL_PBR,
      an94_firing_pin: AN94_V3_PULLEY_METAL_PBR,
      an94_pulley_wheel: AN94_V3_PULLEY_METAL_PBR,
      an94_steel_cable: AN94_V3_PULLEY_METAL_PBR,
      an94_feed_rammer: AN94_V3_PULLEY_METAL_PBR,
      an94_recoil_guide: AN94_V3_PULLEY_METAL_PBR,
      an94_hammer: AN94_V3_PULLEY_METAL_PBR,
      an94_trigger: AN94_V3_PULLEY_METAL_PBR,
      // 405mm floating barrel, upper gas tube/FSB, figure-8 whistling muzzle brake, 15°-canted plum-black 5.45mm mag, orange follower, static coil & floorplate (7 parts)
      an94_barrel: AN94_V3_BARREL_MAG_PBR,
      an94_gas_tube: AN94_V3_BARREL_MAG_PBR,
      an94_muzzle_brake: AN94_V3_BARREL_MAG_PBR,
      an94_mag_body: AN94_V3_BARREL_MAG_PBR,
      an94_mag_follower: AN94_V3_BARREL_MAG_PBR,
      an94_mag_spring: AN94_V3_BARREL_MAG_PBR,
      an94_mag_floorplate: AN94_V3_BARREL_MAG_PBR,
    },
  },
  ztz99a: {
    modelFile: 'ztz99a.glb',
    dynamicSpringParts: ['ztz99a_recoil_springs', 'ztz99a_rammer_spring'],
    pbrOverrides: {
      // Welded RHA hull, FY-4 glacis ERA, rubber-steel side skirts, 6x2 road wheels, dual tracks, rear deck & turret ring (8 parts)
      ztz99a_hull_armor: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_glacis_era: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_side_skirts: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_road_wheels: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_tracks_left: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_tracks_right: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_rear_deck: ZTZ99A_V3_ARMOR_HULL_PBR,
      ztz99a_turret_ring: ZTZ99A_V3_ARMOR_HULL_PBR,
      // Arrowhead turret shell, FY-4 ERA wedges, 125mm ZPT-98 L/50 barrel, cradle, hydro-pneumatic cylinders, breech, CITV & roof armaments (8 parts)
      ztz99a_turret_shell: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_era_wedges: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_main_gun: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_gun_cradle: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_recoil_cylinders: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_breech_block: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_optics_citv: ZTZ99A_V3_TURRET_GUN_PBR,
      ztz99a_roof_armaments: ZTZ99A_V3_TURRET_GUN_PBR,
      // 22-rd carousel autoloader, lift tray, rammer chain, stub ejector, 150HB-2 V12 engine, CH-1000 transmission, torsion bars & crew stations (8 parts)
      ztz99a_autoloader_carousel: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_loading_tray: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_rammer_chain: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_stub_ejector: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_v12_engine: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_transmission: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_torsion_bars: ZTZ99A_V3_INTERIOR_POWER_PBR,
      ztz99a_crew_stations: ZTZ99A_V3_INTERIOR_POWER_PBR,
    },
  },
  m1a2: {
    modelFile: 'm1a2.glb',
    dynamicSpringParts: ['m1a2_recoil_springs', 'm1a2_door_spring'],
    pbrOverrides: {
      // CARC desert-tan hull, heavy ballistic side skirts, 7x2 road wheels, T158 tracks, engine deck, torsion bars & turret ring (8 parts)
      m1a2_hull_shell: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_side_skirts: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_road_wheels: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_tracks_left: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_tracks_right: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_engine_deck: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_torsion_bars: M1A2_V3_HULL_ARMOR_PBR,
      m1a2_turret_ring: M1A2_V3_HULL_ARMOR_PBR,
      // Turret shell, top blow-off panels, NGAP DU composite armor, 120mm L/44 M256 gun, mantlet, breech, CROWS-LP optics & smoke launchers (8 parts)
      m1a2_turret_shell: M1A2_V3_TURRET_GUN_PBR,
      m1a2_blowoff_panels: M1A2_V3_TURRET_GUN_PBR,
      m1a2_composite_armor: M1A2_V3_TURRET_GUN_PBR,
      m1a2_main_gun: M1A2_V3_TURRET_GUN_PBR,
      m1a2_gun_mantlet: M1A2_V3_TURRET_GUN_PBR,
      m1a2_breech_block: M1A2_V3_TURRET_GUN_PBR,
      m1a2_crows_optics: M1A2_V3_TURRET_GUN_PBR,
      m1a2_smoke_launchers: M1A2_V3_TURRET_GUN_PBR,
      // Armored blast doors, 36-rd bustle ammo rack, ready M829A4 round, stub deflector, AGT1500 turbine, X1100 transmission, fuel cells & crew (8 parts)
      m1a2_blast_doors: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_ammo_bustle: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_ready_round: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_stub_deflector: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_agt1500_turbine: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_x1100_transmission: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_fuel_cells: M1A2_V3_TURBINE_BUSTLE_PBR,
      m1a2_crew_stations: M1A2_V3_TURBINE_BUSTLE_PBR,
    },
  },
  leopard2a7: {
    modelFile: 'leopard2a7.glb',
    dynamicSpringParts: ['leo_recoil_springs', 'leo_breech_spring'],
    pbrOverrides: {
      // NATO 3-tone Flecktarn hull, heavy side skirts, 7x2 road wheels, Diehl 570FT tracks, engine deck, torsion bars & turret ring (8 parts)
      leo_hull_shell: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_side_skirts: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_road_wheels: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_tracks_left: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_tracks_right: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_engine_deck: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_torsion_bars: LEOPARD2A7_V3_HULL_CAMO_PBR,
      leo_turret_ring: LEOPARD2A7_V3_HULL_CAMO_PBR,
      // Turret shell, spaced arrowhead wedges, 6.6m Rh-120 L/55A1 gun, mantlet, concentric recoil system, breech, PERI R17A3 & smoke dischargers (8 parts)
      leo_turret_shell: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_arrowhead_wedges: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_main_gun: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_gun_mantlet: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_recoil_system: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_breech_block: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_optics_peri: LEOPARD2A7_V3_TURRET_GUN_PBR,
      leo_smoke_dischargers: LEOPARD2A7_V3_TURRET_GUN_PBR,
      // MTU MB 873 V12 twin-turbo diesel, RENK HSWL 354 gearbox, dual cooling fans, blast door, 15-rd bustle, 27-rd hull rack, ready DM63A1 & crew (8 parts)
      leo_mtu_v12: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_renk_transmission: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_cooling_fans: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_blast_door: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_ammo_bustle: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_hull_ammo_rack: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_ready_round: LEOPARD2A7_V3_POWERPACK_INT_PBR,
      leo_crew_stations: LEOPARD2A7_V3_POWERPACK_INT_PBR,
    },
  },
  tiger1: {
    modelFile: 'tiger1.glb',
    dynamicSpringParts: ['tiger_recoil_springs', 'tiger_breech_spring'],
    pbrOverrides: {
      // RAL 7028 Dunkelgelb 100mm RHA hull box, Feifel side fenders, 48 interleaved Schachtellaufwerk wheels, Kgs 63 tracks, engine deck, torsion bars & ring (8 parts)
      tiger_hull_box: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_side_fenders: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_interleaved_wheels: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_tracks_left: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_tracks_right: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_engine_deck: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_torsion_bars: TIGER1_V3_HULL_ZIMMERIT_PBR,
      tiger_turret_ring: TIGER1_V3_HULL_ZIMMERIT_PBR,
      // Horseshoe turret shell, commander cupola, thick stepped mantlet, 88mm KwK 36 L/56 w/ double-baffle brake, recoil cradle, Krupp breech, guard & TZF 9b (8 parts)
      tiger_turret_shell: TIGER1_V3_TURRET_88MM_PBR,
      tiger_cupola_hatches: TIGER1_V3_TURRET_88MM_PBR,
      tiger_gun_mantlet: TIGER1_V3_TURRET_88MM_PBR,
      tiger_main_gun: TIGER1_V3_TURRET_88MM_PBR,
      tiger_recoil_cradle: TIGER1_V3_TURRET_88MM_PBR,
      tiger_breech_block: TIGER1_V3_TURRET_88MM_PBR,
      tiger_shell_guard: TIGER1_V3_TURRET_88MM_PBR,
      tiger_optics_tzf9b: TIGER1_V3_TURRET_88MM_PBR,
      // Maybach HL230 V12, front Olvar 8-speed transmission, central driveshaft, Elfenbein turret basket, sponson 88mm racks, ready PzGr. 39, fuel tanks & crew (8 parts)
      tiger_maybach_v12: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_transmission: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_driveshaft: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_turret_basket: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_ammo_racks: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_ready_round: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_fuel_tanks: TIGER1_V3_DRIVETRAIN_INT_PBR,
      tiger_crew_stations: TIGER1_V3_DRIVETRAIN_INT_PBR,
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
  return Object.prototype.hasOwnProperty.call(GLB_WEAPON_CONFIGS, weaponId)
    ? GLB_WEAPON_CONFIGS[weaponId]
    : null;
}

export function hasGlbWeaponAsset(weaponId: WeaponId): boolean {
  return Object.prototype.hasOwnProperty.call(GLB_WEAPON_CONFIGS, weaponId);
}

export function isGlbDynamicSpringPart(
  weaponId: WeaponId,
  partId: string
): boolean {
  const cfg = getGlbWeaponConfig(weaponId);
  if (!cfg) return false;
  return cfg.dynamicSpringParts.includes(partId);
}

export function getGlbPartPbrOverride(
  weaponId: WeaponId,
  partId: string
): PbrBindingSpec | undefined {
  return getGlbWeaponConfig(weaponId)?.pbrOverrides[partId];
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
 * Resolves the subpath-safe `.glb` model URL for a migrated weapon, or `null` if unknown.
 */
export function resolveWeaponGlbUrl(
  weaponId: WeaponId,
  baseOverride?: string
): string | null {
  const cfg = getGlbWeaponConfig(weaponId);
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
 * Browser-only Draco GLB loader covering all 27/27 migrated museum exhibits.
 * Automatically skips dynamic springs/limbs/strings, returns an empty `Map` in headless
 * Node or for unknown IDs, and swallows network/decode failures so `geometryService.ts`
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

import type * as THREE from 'three';
import {
  buildGarandBarrelGeometry,
  buildGarandBoltSanitized,
  buildGarandBulletGuideSanitized,
  buildGarandButtplateGeometry,
  buildGarandClipLatchSanitized,
  buildGarandEnblocClipSanitized,
  buildGarandFiringPinSanitized,
  buildGarandFollowerArmSanitized,
  buildGarandFollowerSanitized,
  buildGarandFrontHandguardGeometry,
  buildGarandFrontSightGeometry,
  buildGarandGasCylinderGeometry,
  buildGarandGasLockScrewGeometry,
  buildGarandHammerSanitized,
  buildGarandHammerSpringSanitized,
  buildGarandLowerBandGeometry,
  buildGarandOpRodCatchSanitized,
  buildGarandOpRodGeometry,
  buildGarandOpRodSpringSanitized,
  buildGarandRearHandguardGeometry,
  buildGarandRearSightGeometry,
  buildGarandReceiverGeometry,
  buildGarandTriggerGuardSanitized,
  buildGarandTriggerHousingSanitized,
  buildGarandTriggerSanitized,
  buildGarandWalnutStockGeometry,
} from './meshes/garandGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 24" .30-06 Barrel, Muzzle Gas Cylinder, Long-Stroke Op-Rod & 2-Lug Bolt ('slide' · 8)
  garand_barrel: buildGarandBarrelGeometry,
  garand_gas_cylinder: buildGarandGasCylinderGeometry,
  garand_gas_lock_screw: buildGarandGasLockScrewGeometry,
  garand_front_sight: buildGarandFrontSightGeometry,
  garand_op_rod: buildGarandOpRodGeometry,
  garand_bolt: buildGarandBoltSanitized,
  garand_firing_pin: buildGarandFiringPinSanitized,
  garand_op_rod_spring: buildGarandOpRodSpringSanitized,

  // 2. Forged Open-Top Receiver, T105 Aperture Sight & Black Walnut Stock Suite ('frame' · 8)
  garand_receiver: buildGarandReceiverGeometry,
  garand_rear_sight: buildGarandRearSightGeometry,
  garand_walnut_stock: buildGarandWalnutStockGeometry,
  garand_rear_handguard: buildGarandRearHandguardGeometry,
  garand_front_handguard: buildGarandFrontHandguardGeometry,
  garand_lower_band: buildGarandLowerBandGeometry,
  garand_buttplate: buildGarandButtplateGeometry,
  garand_op_rod_catch: buildGarandOpRodCatchSanitized,

  // 3. Quick-Detach Milled Trigger Group & Safety ('fire_control' · 5)
  garand_trigger_housing: buildGarandTriggerHousingSanitized,
  garand_trigger_guard: buildGarandTriggerGuardSanitized,
  garand_trigger: buildGarandTriggerSanitized,
  garand_hammer: buildGarandHammerSanitized,
  garand_hammer_spring: buildGarandHammerSpringSanitized,

  // 4. 8-Round En-Bloc Clip, Follower Arm & Clip Latch System ('magazine' · 5)
  garand_enbloc_clip: buildGarandEnblocClipSanitized,
  garand_follower: buildGarandFollowerSanitized,
  garand_follower_arm: buildGarandFollowerArmSanitized,
  garand_bullet_guide: buildGarandBulletGuideSanitized,
  garand_clip_latch: buildGarandClipLatchSanitized,
};

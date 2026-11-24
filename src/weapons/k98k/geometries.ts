import type * as THREE from 'three';
import {
  buildK98kBarrelGeometry,
  buildK98kBoltBodyGeometry,
  buildK98kBoltShroudGeometry,
  buildK98kButtplateGeometry,
  buildK98kClawExtractorGeometry,
  buildK98kCleaningRodGeometry,
  buildK98kFiringPinGeometry,
  buildK98kFiringPinSpringGeometry,
  buildK98kFlagSafetyGeometry,
  buildK98kFrontBandGeometry,
  buildK98kFrontSightGeometry,
  buildK98kHandguardGeometry,
  buildK98kMagFloorplateGeometry,
  buildK98kMagFollowerGeometry,
  buildK98kMagSpringGeometry,
  buildK98kRearBandGeometry,
  buildK98kRearSightGeometry,
  buildK98kReceiverGeometry,
  buildK98kSearGeometry,
  buildK98kSearSpringGeometry,
  buildK98kStockGeometry,
  buildK98kStripperClipGeometry,
  buildK98kTriggerGeometry,
  buildK98kTriggerGuardGeometry,
} from './meshes/k98kGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Barrel & Mauser 98 Rotating Bolt Action ('slide' · 8)
  k98k_barrel: buildK98kBarrelGeometry,
  k98k_front_sight: buildK98kFrontSightGeometry,
  k98k_bolt_body: buildK98kBoltBodyGeometry,
  k98k_claw_extractor: buildK98kClawExtractorGeometry,
  k98k_bolt_shroud: buildK98kBoltShroudGeometry,
  k98k_flag_safety: buildK98kFlagSafetyGeometry,
  k98k_firing_pin: buildK98kFiringPinGeometry,
  k98k_firing_pin_spring: buildK98kFiringPinSpringGeometry,

  // 2. Large-Ring Receiver, Laminated Beechwood Stock, Sights & Bands ('frame' · 8)
  k98k_receiver: buildK98kReceiverGeometry,
  k98k_rear_sight: buildK98kRearSightGeometry,
  k98k_stock: buildK98kStockGeometry,
  k98k_handguard: buildK98kHandguardGeometry,
  k98k_front_band: buildK98kFrontBandGeometry,
  k98k_rear_band: buildK98kRearBandGeometry,
  k98k_cleaning_rod: buildK98kCleaningRodGeometry,
  k98k_buttplate: buildK98kButtplateGeometry,

  // 3. Two-Stage Trigger, Sear, Return Spring & Trigger Guard ('fire_control' · 4)
  k98k_trigger: buildK98kTriggerGeometry,
  k98k_sear: buildK98kSearGeometry,
  k98k_sear_spring: buildK98kSearSpringGeometry,
  k98k_trigger_guard: buildK98kTriggerGuardGeometry,

  // 4. 5-Rd Staggered Internal Magazine & Brass Stripper Clip ('magazine' · 4)
  k98k_mag_follower: buildK98kMagFollowerGeometry,
  k98k_mag_spring: buildK98kMagSpringGeometry,
  k98k_mag_floorplate: buildK98kMagFloorplateGeometry,
  k98k_stripper_clip: buildK98kStripperClipGeometry,
};

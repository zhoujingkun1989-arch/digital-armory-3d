import type * as THREE from 'three';
import {
  buildP90BarrelGeometry,
  buildP90BoltSanitized,
  buildP90ButtplateGeometry,
  buildP90ChargingHandlesGeometry,
  buildP90EjectionCoverGeometry,
  buildP90FiringPinSanitized,
  buildP90FlashHiderGeometry,
  buildP90GuideRodsSanitized,
  buildP90HammerPackSanitized,
  buildP90HammerSanitized,
  buildP90HelicalRampSanitized,
  buildP90MagBodySanitized,
  buildP90MagCatchesGeometry,
  buildP90MagFloorplateSanitized,
  buildP90MagFollowerSanitized,
  buildP90MagSpringSanitized,
  buildP90RecoilSpringsSanitized,
  buildP90RingSightGeometry,
  buildP90SelectorSanitized,
  buildP90SlingMountGeometry,
  buildP90StockGeometry,
  buildP90TakedownLockGeometry,
  buildP90TransferBarsSanitized,
  buildP90TriggerSanitized,
  buildP90UpperReceiverGeometry,
} from './meshes/p90Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Modular Optical Upper Receiver, 10.4" Barrel & Blowback Bolt ('slide' · 9)
  p90_upper_receiver: buildP90UpperReceiverGeometry,
  p90_barrel: buildP90BarrelGeometry,
  p90_flash_hider: buildP90FlashHiderGeometry,
  p90_ring_sight: buildP90RingSightGeometry,
  p90_charging_handles: buildP90ChargingHandlesGeometry,
  p90_bolt: buildP90BoltSanitized,
  p90_firing_pin: buildP90FiringPinSanitized,
  p90_guide_rods: buildP90GuideRodsSanitized,
  p90_recoil_springs: buildP90RecoilSpringsSanitized,

  // 2. Ergonomic Bullpup Thumbhole Polymer Stock & Chute ('frame' · 6)
  p90_stock: buildP90StockGeometry,
  p90_buttplate: buildP90ButtplateGeometry,
  p90_takedown_lock: buildP90TakedownLockGeometry,
  p90_mag_catches: buildP90MagCatchesGeometry,
  p90_ejection_cover: buildP90EjectionCoverGeometry,
  p90_sling_mount: buildP90SlingMountGeometry,

  // 3. Progressive Trigger, Rotary Selector & Polymer Hammer Pack ('fire_control' · 5)
  p90_trigger: buildP90TriggerSanitized,
  p90_selector: buildP90SelectorSanitized,
  p90_transfer_bars: buildP90TransferBarsSanitized,
  p90_hammer_pack: buildP90HammerPackSanitized,
  p90_hammer: buildP90HammerSanitized,

  // 4. Top-Mounted 50-Rd Horizontal Magazine & 90° Helical Feed Ramp ('magazine' · 5)
  p90_mag_body: buildP90MagBodySanitized,
  p90_helical_ramp: buildP90HelicalRampSanitized,
  p90_mag_follower: buildP90MagFollowerSanitized,
  p90_mag_spring: buildP90MagSpringSanitized,
  p90_mag_floorplate: buildP90MagFloorplateSanitized,
};

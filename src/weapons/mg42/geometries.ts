import type * as THREE from 'three';
import {
  buildMg42AaSightGeometry,
  buildMg42AmmoBeltGeometry,
  buildMg42AmmoDrumGeometry,
  buildMg42BarrelGeometry,
  buildMg42BarrelLatchGeometry,
  buildMg42BipodGeometry,
  buildMg42BoltCarrierGeometry,
  buildMg42BoltHeadGeometry,
  buildMg42BufferSpringGeometry,
  buildMg42ButtstockGeometry,
  buildMg42ChargingHandleGeometry,
  buildMg42FeedPawlGeometry,
  buildMg42FeedTrayGeometry,
  buildMg42GripFrameGeometry,
  buildMg42LockingRollerLeftGeometry,
  buildMg42LockingRollersGeometry,
  buildMg42LockingWedgeGeometry,
  buildMg42MuzzleBoosterGeometry,
  buildMg42ReceiverShroudGeometry,
  buildMg42RecoilBufferGeometry,
  buildMg42RecoilSpringGeometry,
  buildMg42SearGeometry,
  buildMg42SearSpringGeometry,
  buildMg42TopCoverGeometry,
  buildMg42TriggerGeometry,
} from './meshes/mg42Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Barrel, Booster, Latch & Twin-Roller BCG ('slide' · 12)
  mg42_barrel: buildMg42BarrelGeometry,
  mg42_muzzle_booster: buildMg42MuzzleBoosterGeometry,
  mg42_barrel_latch: buildMg42BarrelLatchGeometry,
  mg42_bolt_head: buildMg42BoltHeadGeometry,
  mg42_locking_rollers: buildMg42LockingRollersGeometry,
  mg42_locking_roller_left: buildMg42LockingRollerLeftGeometry,
  mg42_locking_wedge: buildMg42LockingWedgeGeometry,
  mg42_bolt_carrier: buildMg42BoltCarrierGeometry,
  mg42_charging_handle: buildMg42ChargingHandleGeometry,
  mg42_recoil_spring: buildMg42RecoilSpringGeometry,
  mg42_recoil_buffer: buildMg42RecoilBufferGeometry,
  mg42_buffer_spring: buildMg42BufferSpringGeometry,

  // 2. Monolithic Stamped Shroud Receiver, Top Cover, AA Sight, Bipod & Buttstock ('frame' · 5)
  mg42_receiver_shroud: buildMg42ReceiverShroudGeometry,
  mg42_top_cover: buildMg42TopCoverGeometry,
  mg42_aa_sight: buildMg42AaSightGeometry,
  mg42_bipod: buildMg42BipodGeometry,
  mg42_buttstock: buildMg42ButtstockGeometry,

  // 3. Stamped Bakelite Grip, Full-Auto Trigger & Open-Bolt Sear ('fire_control' · 4)
  mg42_grip_frame: buildMg42GripFrameGeometry,
  mg42_trigger: buildMg42TriggerGeometry,
  mg42_sear: buildMg42SearGeometry,
  mg42_sear_spring: buildMg42SearSpringGeometry,

  // 4. Shuttle Feed Pawls, Feed Tray, Gurt 34 Steel Belt & 50-Rd Drum ('magazine' · 4)
  mg42_feed_tray: buildMg42FeedTrayGeometry,
  mg42_feed_pawl: buildMg42FeedPawlGeometry,
  mg42_ammo_belt: buildMg42AmmoBeltGeometry,
  mg42_ammo_drum: buildMg42AmmoDrumGeometry,
};

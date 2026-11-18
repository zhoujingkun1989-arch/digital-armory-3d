import type * as THREE from 'three';
import {
  buildM249AmmoBoxSanitized,
  buildM249BarrelGeometry,
  buildM249BarrelHandleGeometry,
  buildM249BipodGeometry,
  buildM249BoltSanitized,
  buildM249ButtstockGeometry,
  buildM249ChargingHandleSanitized,
  buildM249FeedLeverSanitized,
  buildM249FeedPawlsSanitized,
  buildM249FeedTraySanitized,
  buildM249FiringPinSanitized,
  buildM249FrontSightGeometry,
  buildM249GasRegulatorGeometry,
  buildM249GasTubeGeometry,
  buildM249HandguardGeometry,
  buildM249HydraulicBufferSanitized,
  buildM249M27BeltSanitized,
  buildM249OpenBoltSearSanitized,
  buildM249PistonCarrierGeometry,
  buildM249RearSightGeometry,
  buildM249ReceiverGeometry,
  buildM249RecoilSpringSanitized,
  buildM249SearSpringSanitized,
  buildM249TopCoverGeometry,
  buildM249TriggerFrameSanitized,
  buildM249TriggerSanitized,
} from './meshes/m249Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Quick-Change 18.3" Barrel, Gas Piston & Open-Bolt Rotating Carrier Group ('slide' · 9)
  m249_barrel: buildM249BarrelGeometry,
  m249_barrel_handle: buildM249BarrelHandleGeometry,
  m249_gas_regulator: buildM249GasRegulatorGeometry,
  m249_piston_carrier: buildM249PistonCarrierGeometry,
  m249_bolt: buildM249BoltSanitized,
  m249_firing_pin: buildM249FiringPinSanitized,
  m249_charging_handle: buildM249ChargingHandleSanitized,
  m249_recoil_spring: buildM249RecoilSpringSanitized,
  m249_hydraulic_buffer: buildM249HydraulicBufferSanitized,

  // 2. Stamped Steel Receiver, Hinged Top Cover, Heatshield, Bipod & Buttstock ('frame' · 8)
  m249_receiver: buildM249ReceiverGeometry,
  m249_top_cover: buildM249TopCoverGeometry,
  m249_rear_sight: buildM249RearSightGeometry,
  m249_front_sight: buildM249FrontSightGeometry,
  m249_handguard: buildM249HandguardGeometry,
  m249_gas_tube: buildM249GasTubeGeometry,
  m249_bipod: buildM249BipodGeometry,
  m249_buttstock: buildM249ButtstockGeometry,

  // 3. Open-Bolt Sear, Trigger Pack & Cross-Bolt Safety ('fire_control' · 4)
  m249_trigger_frame: buildM249TriggerFrameSanitized,
  m249_trigger: buildM249TriggerSanitized,
  m249_open_bolt_sear: buildM249OpenBoltSearSanitized,
  m249_sear_spring: buildM249SearSpringSanitized,

  // 4. Dual-Pawl Belt Shuttle, Feed Tray, M27 Link Strip & 200-Rd Box ('magazine' · 5)
  m249_feed_tray: buildM249FeedTraySanitized,
  m249_feed_lever: buildM249FeedLeverSanitized,
  m249_feed_pawls: buildM249FeedPawlsSanitized,
  m249_m27_belt: buildM249M27BeltSanitized,
  m249_ammo_box: buildM249AmmoBoxSanitized,
};

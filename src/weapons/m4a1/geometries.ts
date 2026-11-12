import type * as THREE from 'three';
import {
  buildM4a1BoltCarrierGeometry,
  buildM4a1BoltGeometry,
  buildM4a1CarryHandleGeometry,
  buildM4a1ChargingHandleGeometry,
  buildM4a1DustCoverGeometry,
  buildM4a1FiringPinGeometry,
  buildM4a1GasTubeGeometry,
  buildM4a1RasLowerGeometry,
  buildM4a1RasUpperGeometry,
  buildM4a1UpperReceiverGeometry,
} from './meshes/m4a1Geometries';
import {
  buildM4a1BarrelGeometry,
  buildM4a1BufferGeometry,
  buildM4a1BufferSpringGeometry,
  buildM4a1BufferTubeGeometry,
  buildM4a1ButtstockGeometry,
  buildM4a1FlashHiderGeometry,
  buildM4a1FrontSightBaseGeometry,
  buildM4a1HammerGeometry,
  buildM4a1LowerReceiverGeometry,
  buildM4a1MagBodyGeometry,
  buildM4a1MagFloorplateGeometry,
  buildM4a1MagFollowerGeometry,
  buildM4a1MagSpringGeometry,
  buildM4a1PistolGripGeometry,
  buildM4a1SelectorGeometry,
  buildM4a1TriggerGeometry,
} from './meshes/m4a1ExtraGeometries';

export const GEOMETRY_BUILDERS: Record<
  string,
  () => THREE.BufferGeometry
> = {
  // 1. Flat-Top Upper, DI BCG & KAC M4 RAS ('slide' · 10)
  m4a1_upper_receiver: buildM4a1UpperReceiverGeometry,
  m4a1_carry_handle: buildM4a1CarryHandleGeometry,
  m4a1_charging_handle: buildM4a1ChargingHandleGeometry,
  m4a1_dust_cover: buildM4a1DustCoverGeometry,
  m4a1_bolt_carrier: buildM4a1BoltCarrierGeometry,
  m4a1_bolt: buildM4a1BoltGeometry,
  m4a1_firing_pin: buildM4a1FiringPinGeometry,
  m4a1_gas_tube: buildM4a1GasTubeGeometry,
  m4a1_ras_upper: buildM4a1RasUpperGeometry,
  m4a1_ras_lower: buildM4a1RasLowerGeometry,

  // 2. Forged Lower, 14.5" Barrel & 6-Pos Buffer System ('frame' · 9)
  m4a1_lower_receiver: buildM4a1LowerReceiverGeometry,
  m4a1_barrel: buildM4a1BarrelGeometry,
  m4a1_flash_hider: buildM4a1FlashHiderGeometry,
  m4a1_front_sight_base: buildM4a1FrontSightBaseGeometry,
  m4a1_buffer_tube: buildM4a1BufferTubeGeometry,
  m4a1_buffer: buildM4a1BufferGeometry,
  m4a1_buffer_spring: buildM4a1BufferSpringGeometry,
  m4a1_buttstock: buildM4a1ButtstockGeometry,
  m4a1_pistol_grip: buildM4a1PistolGripGeometry,

  // 3. Select-Fire FCG ('fire_control' · 3)
  m4a1_hammer: buildM4a1HammerGeometry,
  m4a1_trigger: buildM4a1TriggerGeometry,
  m4a1_selector: buildM4a1SelectorGeometry,

  // 4. 30-Rd USGI STANAG Magazine ('magazine' · 4)
  m4a1_mag_body: buildM4a1MagBodyGeometry,
  m4a1_mag_follower: buildM4a1MagFollowerGeometry,
  m4a1_mag_spring: buildM4a1MagSpringGeometry,
  m4a1_mag_floorplate: buildM4a1MagFloorplateGeometry,
};

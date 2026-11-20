import type * as THREE from 'three';
import {
  buildAn94BarrelGeometry,
  buildAn94BoltCarrierGeometry,
  buildAn94BoltGeometry,
  buildAn94ButtstockGeometry,
  buildAn94DustCoverGeometry,
  buildAn94FeedRammerGeometry,
  buildAn94FireSelectorGeometry,
  buildAn94FiringPinGeometry,
  buildAn94GasTubeGeometry,
  buildAn94HammerGeometry,
  buildAn94InnerReceiverGeometry,
  buildAn94MagBodyGeometry,
  buildAn94MagFloorplateGeometry,
  buildAn94MagFollowerGeometry,
  buildAn94MagSpringGeometry,
  buildAn94MuzzleBrakeGeometry,
  buildAn94OuterHousingGeometry,
  buildAn94PistolGripGeometry,
  buildAn94PulleyWheelGeometry,
  buildAn94RearSightGeometry,
  buildAn94ReceiverBufferSpringGeometry,
  buildAn94RecoilGuideGeometry,
  buildAn94RecoilSpringGeometry,
  buildAn94SafetySwitchGeometry,
  buildAn94SteelCableGeometry,
  buildAn94TriggerGeometry,
} from './meshes/an94Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Floating Barreled-Action Carriage, Pulley-Cable Transmission & Rotating Bolt ('slide' · 9)
  an94_inner_receiver: buildAn94InnerReceiverGeometry,
  an94_bolt_carrier: buildAn94BoltCarrierGeometry,
  an94_bolt: buildAn94BoltGeometry,
  an94_firing_pin: buildAn94FiringPinGeometry,
  an94_pulley_wheel: buildAn94PulleyWheelGeometry,
  an94_steel_cable: buildAn94SteelCableGeometry,
  an94_feed_rammer: buildAn94FeedRammerGeometry,
  an94_recoil_guide: buildAn94RecoilGuideGeometry,
  an94_recoil_spring: buildAn94RecoilSpringGeometry,

  // 2. Monocoque Polymer Outer Housing, Floating 405mm Barrel, Figure-8 Brake & Furniture ('frame' · 9)
  an94_outer_housing: buildAn94OuterHousingGeometry,
  an94_dust_cover: buildAn94DustCoverGeometry,
  an94_barrel: buildAn94BarrelGeometry,
  an94_gas_tube: buildAn94GasTubeGeometry,
  an94_muzzle_brake: buildAn94MuzzleBrakeGeometry,
  an94_buttstock: buildAn94ButtstockGeometry,
  an94_pistol_grip: buildAn94PistolGripGeometry,
  an94_rear_sight: buildAn94RearSightGeometry,
  an94_receiver_buffer_spring: buildAn94ReceiverBufferSpringGeometry,

  // 3. Hyperburst Hammer FCG, Dedicated Safety & 3-Mode Selector ('fire_control' · 4)
  an94_hammer: buildAn94HammerGeometry,
  an94_trigger: buildAn94TriggerGeometry,
  an94_safety_switch: buildAn94SafetySwitchGeometry,
  an94_fire_selector: buildAn94FireSelectorGeometry,

  // 4. Iconic 15°-Right-Canted 30-Round 5.45×39mm Izhmash Polymer Magazine ('magazine' · 4)
  an94_mag_body: buildAn94MagBodyGeometry,
  an94_mag_follower: buildAn94MagFollowerGeometry,
  an94_mag_spring: buildAn94MagSpringGeometry,
  an94_mag_floorplate: buildAn94MagFloorplateGeometry,
};

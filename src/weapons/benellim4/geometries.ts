import type * as THREE from 'three';
import {
  buildBenelliM4ArgoPistonsGeometry,
  buildBenelliM4ArgoPlugsGeometry,
  buildBenelliM4BarrelGeometry,
  buildBenelliM4BoltCarrierGeometry,
  buildBenelliM4BoltHeadGeometry,
  buildBenelliM4CamPinGeometry,
  buildBenelliM4ChargingHandleGeometry,
  buildBenelliM4FiringPinGeometry,
  buildBenelliM4RecoilSpringGeometry,
} from './meshes/benellim4Geometries';
import {
  buildBenelliM4ForendGeometry,
  buildBenelliM4FrontSightGeometry,
  buildBenelliM4HammerGeometry,
  buildBenelliM4HammerSpringGeometry,
  buildBenelliM4MagCapGeometry,
  buildBenelliM4MagFollowerGeometry,
  buildBenelliM4MagSpringGeometry,
  buildBenelliM4MagTubeGeometry,
  buildBenelliM4PicatinnyRailGeometry,
  buildBenelliM4RearSightGeometry,
  buildBenelliM4ReceiverGeometry,
  buildBenelliM4RecoilTubeGeometry,
  buildBenelliM4SafetyButtonGeometry,
  buildBenelliM4ShellElevatorGeometry,
  buildBenelliM4TelestockGeometry,
  buildBenelliM4TriggerGeometry,
  buildBenelliM4TriggerHousingGeometry,
} from './meshes/benellim4ExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 18.5" Barrel, Twin ARGO Pistons & Rotating Bolt Group ('slide' · 9)
  benellim4_barrel: buildBenelliM4BarrelGeometry,
  benellim4_argo_pistons: buildBenelliM4ArgoPistonsGeometry,
  benellim4_argo_plugs: buildBenelliM4ArgoPlugsGeometry,
  benellim4_bolt_carrier: buildBenelliM4BoltCarrierGeometry,
  benellim4_bolt_head: buildBenelliM4BoltHeadGeometry,
  benellim4_cam_pin: buildBenelliM4CamPinGeometry,
  benellim4_firing_pin: buildBenelliM4FiringPinGeometry,
  benellim4_charging_handle: buildBenelliM4ChargingHandleGeometry,
  benellim4_recoil_spring: buildBenelliM4RecoilSpringGeometry,

  // 2. Hard-Anodized Receiver, Ghost-Ring Sights & M1014 Collapsible Stock ('frame' · 7)
  benellim4_receiver: buildBenelliM4ReceiverGeometry,
  benellim4_picatinny_rail: buildBenelliM4PicatinnyRailGeometry,
  benellim4_front_sight: buildBenelliM4FrontSightGeometry,
  benellim4_rear_sight: buildBenelliM4RearSightGeometry,
  benellim4_forend: buildBenelliM4ForendGeometry,
  benellim4_recoil_tube: buildBenelliM4RecoilTubeGeometry,
  benellim4_telestock: buildBenelliM4TelestockGeometry,

  // 3. Removable Trigger Pack & Shell Release Linkage ('fire_control' · 5)
  benellim4_trigger_housing: buildBenelliM4TriggerHousingGeometry,
  benellim4_trigger: buildBenelliM4TriggerGeometry,
  benellim4_hammer: buildBenelliM4HammerGeometry,
  benellim4_hammer_spring: buildBenelliM4HammerSpringGeometry,
  benellim4_safety_button: buildBenelliM4SafetyButtonGeometry,

  // 4. 7-Round Underbarrel Tubular Magazine & Shell Carrier Elevator ('magazine' · 5)
  benellim4_mag_tube: buildBenelliM4MagTubeGeometry,
  benellim4_mag_cap: buildBenelliM4MagCapGeometry,
  benellim4_mag_spring: buildBenelliM4MagSpringGeometry,
  benellim4_mag_follower: buildBenelliM4MagFollowerGeometry,
  benellim4_shell_elevator: buildBenelliM4ShellElevatorGeometry,
};

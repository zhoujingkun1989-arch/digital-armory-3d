import type * as THREE from 'three';
import {
  buildG11BarrelGeometry,
  buildG11BufferAssemblyGeometry,
  buildG11ButtplateGeometry,
  buildG11ClockworkGearsGeometry,
  buildG11DrivingRodGeometry,
  buildG11FiringPinGeometry,
  buildG11FlashHiderGeometry,
  buildG11GasPistonGeometry,
  buildG11InnerReceiverGeometry,
  buildG11LoadingRammerGeometry,
  buildG11MagEndcapGeometry,
  buildG11MagFollowerGeometry,
  buildG11MagSpringGeometry,
  buildG11MagTubeGeometry,
  buildG11OpticHandleGeometry,
  buildG11OuterHousingGeometry,
  buildG11PistolGripGeometry,
  buildG11RecoilSpringGeometry,
  buildG11RotaryBreechGeometry,
  buildG11SelectorGeometry,
  buildG11SpareClipsGeometry,
  buildG11TriggerGeometry,
  buildG11TriggerPackGeometry,
  buildG11WindingKnobGeometry,
} from './meshes/g11Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Floating Barreled Action, 90° Rotary Breech & Recoil ('slide' · 7)
  g11_barrel: buildG11BarrelGeometry,
  g11_flash_hider: buildG11FlashHiderGeometry,
  g11_inner_receiver: buildG11InnerReceiverGeometry,
  g11_rotary_breech: buildG11RotaryBreechGeometry,
  g11_gas_piston: buildG11GasPistonGeometry,
  g11_driving_rod: buildG11DrivingRodGeometry,
  g11_recoil_spring: buildG11RecoilSpringGeometry,

  // 2. Monocoque Polymer Shell, Integral Optic & Exterior Controls ('frame' · 7)
  g11_outer_housing: buildG11OuterHousingGeometry,
  g11_optic_handle: buildG11OpticHandleGeometry,
  g11_pistol_grip: buildG11PistolGripGeometry,
  g11_buttplate: buildG11ButtplateGeometry,
  g11_winding_knob: buildG11WindingKnobGeometry,
  g11_spare_clips: buildG11SpareClipsGeometry,
  g11_buffer_assembly: buildG11BufferAssemblyGeometry,

  // 3. Swiss-Watch Clockwork Gear Train, Rammer, Burst Pack & Selector ('fire_control' · 6)
  g11_clockwork_gears: buildG11ClockworkGearsGeometry,
  g11_loading_rammer: buildG11LoadingRammerGeometry,
  g11_firing_pin: buildG11FiringPinGeometry,
  g11_trigger_pack: buildG11TriggerPackGeometry,
  g11_trigger: buildG11TriggerGeometry,
  g11_selector: buildG11SelectorGeometry,

  // 4. Overhead 45-Round 4.73×33mm DM11 Caseless Magazine ('magazine' · 4)
  g11_mag_tube: buildG11MagTubeGeometry,
  g11_mag_follower: buildG11MagFollowerGeometry,
  g11_mag_spring: buildG11MagSpringGeometry,
  g11_mag_endcap: buildG11MagEndcapGeometry,
};

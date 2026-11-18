import type * as THREE from 'three';
import {
  buildP08BarrelExtensionGeometry,
  buildP08BarrelGeometry,
  buildP08BreechblockGeometry,
  buildP08ExtractorGeometry,
  buildP08FrontToggleGeometry,
  buildP08RearToggleGeometry,
  buildP08StrikerGeometry,
  buildP08StrikerSpringGeometry,
  buildP08TogglePinsGeometry,
} from './meshes/p08Geometries';
import {
  buildP08EjectorGeometry,
  buildP08FrameGeometry,
  buildP08GripLeftGeometry,
  buildP08GripRightGeometry,
  buildP08HoldOpenGeometry,
  buildP08MagBaseGeometry,
  buildP08MagBodyGeometry,
  buildP08MagFollowerGeometry,
  buildP08MagSpringGeometry,
  buildP08RecoilSpringGeometry,
  buildP08SearBarGeometry,
  buildP08SideplateGeometry,
  buildP08TakedownLeverGeometry,
  buildP08ThumbSafetyGeometry,
  buildP08TriggerGeometry,
  buildP08TriggerLeverGeometry,
} from './meshes/p08ExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 4" Barrel, Forked Barrel Extension & Articulated Toggle-Lock Train ('slide' · 9)
  p08_barrel: buildP08BarrelGeometry,
  p08_barrel_extension: buildP08BarrelExtensionGeometry,
  p08_breechblock: buildP08BreechblockGeometry,
  p08_extractor: buildP08ExtractorGeometry,
  p08_front_toggle: buildP08FrontToggleGeometry,
  p08_rear_toggle: buildP08RearToggleGeometry,
  p08_toggle_pins: buildP08TogglePinsGeometry,
  p08_striker: buildP08StrikerGeometry,
  p08_striker_spring: buildP08StrikerSpringGeometry,

  // 2. Forged Curved-Ramp Frame, Sideplate, Takedown & Walnut Grips ('frame' · 7)
  p08_frame: buildP08FrameGeometry,
  p08_sideplate: buildP08SideplateGeometry,
  p08_takedown_lever: buildP08TakedownLeverGeometry,
  p08_ejector: buildP08EjectorGeometry,
  p08_hold_open: buildP08HoldOpenGeometry,
  p08_grip_left: buildP08GripLeftGeometry,
  p08_grip_right: buildP08GripRightGeometry,

  // 3. Lateral L-Lever Sear, Crescent Trigger, Thumb Safety & S-Link Recoil ('fire_control' · 5)
  p08_trigger: buildP08TriggerGeometry,
  p08_trigger_lever: buildP08TriggerLeverGeometry,
  p08_sear_bar: buildP08SearBarGeometry,
  p08_thumb_safety: buildP08ThumbSafetyGeometry,
  p08_recoil_spring: buildP08RecoilSpringGeometry,

  // 4. 8-Round Sheet-Steel Magazine w/ Machined Concentric Pull Knob ('magazine' · 4)
  p08_mag_body: buildP08MagBodyGeometry,
  p08_mag_follower: buildP08MagFollowerGeometry,
  p08_mag_spring: buildP08MagSpringGeometry,
  p08_mag_base: buildP08MagBaseGeometry,
};

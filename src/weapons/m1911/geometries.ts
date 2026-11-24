import type * as THREE from 'three';
import {
  buildM1911BarrelBushingGeometry,
  buildM1911BarrelGeometry,
  buildM1911BarrelLinkGeometry,
  buildM1911ExtractorGeometry,
  buildM1911FiringPinGeometry,
  buildM1911FrameGeometry,
  buildM1911GripLeftGeometry,
  buildM1911GripRightGeometry,
  buildM1911GripSafetyGeometry,
  buildM1911HammerGeometry,
  buildM1911LeafSpringGeometry,
  buildM1911MagBodyGeometry,
  buildM1911MagFollowerGeometry,
  buildM1911MagSpringGeometry,
  buildM1911MainspringGeometry,
  buildM1911MainspringHousingGeometry,
  buildM1911RecoilGuideGeometry,
  buildM1911RecoilPlugGeometry,
  buildM1911RecoilSpringGeometry,
  buildM1911SearDisconnectorGeometry,
  buildM1911SlideGeometry,
  buildM1911SlideStopGeometry,
  buildM1911ThumbSafetyGeometry,
  buildM1911TriggerGeometry,
} from './meshes/m1911Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 5" Barrel, Swinging Link, Bushing & Parkerized Slide ('slide' · 9)
  m1911_slide: buildM1911SlideGeometry,
  m1911_barrel: buildM1911BarrelGeometry,
  m1911_barrel_link: buildM1911BarrelLinkGeometry,
  m1911_barrel_bushing: buildM1911BarrelBushingGeometry,
  m1911_recoil_plug: buildM1911RecoilPlugGeometry,
  m1911_recoil_guide: buildM1911RecoilGuideGeometry,
  m1911_recoil_spring: buildM1911RecoilSpringGeometry,
  m1911_firing_pin: buildM1911FiringPinGeometry,
  m1911_extractor: buildM1911ExtractorGeometry,

  // 2. Forged Frame, Controls & Double-Diamond Walnut Grips ('frame' · 6)
  m1911_frame: buildM1911FrameGeometry,
  m1911_slide_stop: buildM1911SlideStopGeometry,
  m1911_thumb_safety: buildM1911ThumbSafetyGeometry,
  m1911_mainspring_housing: buildM1911MainspringHousingGeometry,
  m1911_grip_left: buildM1911GripLeftGeometry,
  m1911_grip_right: buildM1911GripRightGeometry,

  // 3. Single-Action Spur Hammer, Grip Safety & Sliding Trigger ('fire_control' · 6)
  m1911_hammer: buildM1911HammerGeometry,
  m1911_trigger: buildM1911TriggerGeometry,
  m1911_sear_disconnector: buildM1911SearDisconnectorGeometry,
  m1911_grip_safety: buildM1911GripSafetyGeometry,
  m1911_leaf_spring: buildM1911LeafSpringGeometry,
  m1911_mainspring: buildM1911MainspringGeometry,

  // 4. 7-Round Single-Stack .45 ACP Magazine ('magazine' · 3)
  m1911_mag_body: buildM1911MagBodyGeometry,
  m1911_mag_follower: buildM1911MagFollowerGeometry,
  m1911_mag_spring: buildM1911MagSpringGeometry,
};

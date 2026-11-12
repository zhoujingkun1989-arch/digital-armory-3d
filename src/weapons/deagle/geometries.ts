import type * as THREE from 'three';
import {
  buildDeagleBarrelGeometry,
  buildDeagleBoltGeometry,
  buildDeagleCamPinGeometry,
  buildDeagleExtractorGeometry,
  buildDeagleFiringPinGeometry,
  buildDeagleFrontSightGeometry,
  buildDeagleRearSightGeometry,
  buildDeagleRecoilRodsGeometry,
  buildDeagleRecoilSpringsGeometry,
  buildDeagleSafetyGeometry,
  buildDeagleSlideGeometry,
} from './meshes/deagleGeometries';
import {
  buildDeagleFrameGeometry,
  buildDeagleGripGeometry,
  buildDeagleHammerGeometry,
  buildDeagleHammerStrutGeometry,
  buildDeagleMagBaseplateGeometry,
  buildDeagleMagBodyGeometry,
  buildDeagleMagCatchGeometry,
  buildDeagleMagFollowerGeometry,
  buildDeagleMagSpringGeometry,
  buildDeagleSearGeometry,
  buildDeagleSlideStopGeometry,
  buildDeagleTakedownLeverGeometry,
  buildDeagleTriggerGeometry,
} from './meshes/deagleExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Slide, Fixed Barrel, Rotating Bolt & Dual Recoil Assembly ('slide' · 11)
  deagle_barrel: buildDeagleBarrelGeometry,
  deagle_slide: buildDeagleSlideGeometry,
  deagle_bolt: buildDeagleBoltGeometry,
  deagle_cam_pin: buildDeagleCamPinGeometry,
  deagle_firing_pin: buildDeagleFiringPinGeometry,
  deagle_extractor: buildDeagleExtractorGeometry,
  deagle_safety: buildDeagleSafetyGeometry,
  deagle_front_sight: buildDeagleFrontSightGeometry,
  deagle_rear_sight: buildDeagleRearSightGeometry,
  deagle_recoil_rods: buildDeagleRecoilRodsGeometry,
  deagle_recoil_springs: buildDeagleRecoilSpringsGeometry,

  // 2. Polished Chrome Steel Frame, Controls & Wrap-Around Rubber Grip ('frame' · 5)
  deagle_frame: buildDeagleFrameGeometry,
  deagle_takedown_lever: buildDeagleTakedownLeverGeometry,
  deagle_slide_stop: buildDeagleSlideStopGeometry,
  deagle_mag_catch: buildDeagleMagCatchGeometry,
  deagle_grip: buildDeagleGripGeometry,

  // 3. Exposed Spur Hammer & Single-Action Transfer-Bar FCG ('fire_control' · 4)
  deagle_hammer: buildDeagleHammerGeometry,
  deagle_hammer_strut: buildDeagleHammerStrutGeometry,
  deagle_trigger: buildDeagleTriggerGeometry,
  deagle_sear: buildDeagleSearGeometry,

  // 4. 7-Round .50 Action Express Steel Magazine Assembly ('magazine' · 4)
  deagle_mag_body: buildDeagleMagBodyGeometry,
  deagle_mag_follower: buildDeagleMagFollowerGeometry,
  deagle_mag_spring: buildDeagleMagSpringGeometry,
  deagle_mag_baseplate: buildDeagleMagBaseplateGeometry,
};

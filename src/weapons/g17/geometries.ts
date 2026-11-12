import type * as THREE from 'three';
import {
  buildBarrelGeometry,
  buildExtractorGeometry,
  buildExtractorPlungerGeometry,
  buildFiringPinSafetyGeometry,
  buildFrontSightGeometry,
  buildRearSightGeometry,
  buildRecoilGuideRodGeometry,
  buildRecoilSpringGeometry,
  buildSlideCoverPlateGeometry,
  buildSlideGeometry,
  buildStrikerGeometry,
  buildStrikerSpringGeometry,
} from './meshes/slideGeometries';
import {
  buildFrameGeometry,
  buildLockingBlockGeometry,
  buildMagazineCatchGeometry,
  buildPinGeometry,
  buildSlideLockGeometry,
  buildSlideStopLeverGeometry,
} from './meshes/frameGeometries';
import {
  buildConnectorGeometry,
  buildTriggerHousingGeometry,
  buildTriggerSpringGeometry,
  buildTriggerWithBarGeometry,
} from './meshes/triggerGeometries';
import {
  buildMagBasePlateGeometry,
  buildMagBodyGeometry,
  buildMagFollowerGeometry,
  buildMagSpringGeometry,
} from './meshes/magGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // Slide Assembly (12)
  slide: buildSlideGeometry,
  front_sight: buildFrontSightGeometry,
  rear_sight: buildRearSightGeometry,
  barrel: buildBarrelGeometry,
  recoil_guide_rod: buildRecoilGuideRodGeometry,
  recoil_spring: buildRecoilSpringGeometry,
  slide_cover_plate: buildSlideCoverPlateGeometry,
  striker: buildStrikerGeometry,
  striker_spring: buildStrikerSpringGeometry,
  firing_pin_safety: buildFiringPinSafetyGeometry,
  extractor: buildExtractorGeometry,
  extractor_plunger: buildExtractorPlungerGeometry,

  // Frame & Controls (8)
  frame: buildFrameGeometry,
  locking_block: buildLockingBlockGeometry,
  slide_lock: buildSlideLockGeometry,
  slide_stop_lever: buildSlideStopLeverGeometry,
  magazine_catch: buildMagazineCatchGeometry,
  trigger_pin: () => buildPinGeometry(0.19, 2.54, true),
  locking_block_pin: () => buildPinGeometry(0.145, 2.5, false),
  trigger_housing_pin: () => buildPinGeometry(0.145, 2.46, false),

  // Fire Control Group (4)
  trigger_with_bar: buildTriggerWithBarGeometry,
  trigger_housing: buildTriggerHousingGeometry,
  connector: buildConnectorGeometry,
  trigger_spring: buildTriggerSpringGeometry,

  // Magazine Assembly (4)
  mag_body: buildMagBodyGeometry,
  mag_follower: buildMagFollowerGeometry,
  mag_spring: buildMagSpringGeometry,
  mag_base_plate: buildMagBasePlateGeometry,
};

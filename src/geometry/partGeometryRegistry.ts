import * as THREE from 'three';
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
} from './slideGeometries';
import {
  buildFrameGeometry,
  buildLockingBlockGeometry,
  buildMagazineCatchGeometry,
  buildPinGeometry,
  buildSlideLockGeometry,
  buildSlideStopLeverGeometry,
} from './frameGeometries';
import {
  buildConnectorGeometry,
  buildTriggerHousingGeometry,
  buildTriggerSpringGeometry,
  buildTriggerWithBarGeometry,
} from './triggerGeometries';
import {
  buildMagBasePlateGeometry,
  buildMagBodyGeometry,
  buildMagFollowerGeometry,
  buildMagSpringGeometry,
} from './magGeometries';
import {
  buildAkBarrelGeometry,
  buildAkButtstockGeometry,
  buildAkCheekRiserGeometry,
  buildAkGasBlockGeometry,
  buildAkLowerHandguardGeometry,
  buildAkMuzzleDeviceGeometry,
  buildAkPistolGripGeometry,
  buildAkReceiverGeometry,
} from './ak15ReceiverGeometries';
import {
  buildAkBoltCarrierGeometry,
  buildAkBoltGeometry,
  buildAkDustCoverGeometry,
  buildAkExtractorGeometry,
  buildAkFiringPinGeometry,
  buildAkGasTubeGeometry,
  buildAkRearSightGeometry,
  buildAkRecoilGuideGeometry,
  buildAkRecoilSpringGeometry,
  buildAkUpperHandguardGeometry,
} from './ak15BoltAndUpperGeometries';
import {
  buildAkDisconnectorGeometry,
  buildAkHammerGeometry,
  buildAkMagBodyGeometry,
  buildAkMagFloorplateGeometry,
  buildAkMagFollowerGeometry,
  buildAkMagSpringGeometry,
  buildAkSelectorGeometry,
  buildAkTriggerGeometry,
} from './ak15FcgAndMagGeometries';
import { AUG_MODULE } from '../data/weapons/augModule';
import { AWM_MODULE } from '../data/weapons/awmModule';
import { DEAGLE_MODULE } from '../data/weapons/deagleModule';
import { M4A1_MODULE } from '../data/weapons/m4a1Module';
import { M82A1_MODULE } from '../data/weapons/m82a1Module';
import { MP5_MODULE } from '../data/weapons/mp5Module';
import { P320_MODULE } from '../data/weapons/p320Module';
import { SCAR_MODULE } from '../data/weapons/scarModule';

const geometryCache = new Map<string, THREE.BufferGeometry>();

const builders: Record<string, () => THREE.BufferGeometry> = {
  // ==================== BAY-04: Glock 17 Gen3 (28 Parts) ====================
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

  // ==================== BAY-01: AK-15M1 Obr. 2023 (26 Parts) ====================
  // 1. Piston Bolt, Recoil & Upper Group (10)
  ak_dust_cover: buildAkDustCoverGeometry,
  ak_rear_sight: buildAkRearSightGeometry,
  ak_bolt_carrier: buildAkBoltCarrierGeometry,
  ak_bolt: buildAkBoltGeometry,
  ak_firing_pin: buildAkFiringPinGeometry,
  ak_extractor: buildAkExtractorGeometry,
  ak_recoil_guide: buildAkRecoilGuideGeometry,
  ak_recoil_spring: buildAkRecoilSpringGeometry,
  ak_upper_handguard: buildAkUpperHandguardGeometry,
  ak_gas_tube: buildAkGasTubeGeometry,

  // 2. Stamped Receiver, CHF Barrel & EVO Furniture (8)
  ak_receiver: buildAkReceiverGeometry,
  ak_barrel: buildAkBarrelGeometry,
  ak_muzzle_device: buildAkMuzzleDeviceGeometry,
  ak_gas_block: buildAkGasBlockGeometry,
  ak_lower_handguard: buildAkLowerHandguardGeometry,
  ak_buttstock: buildAkButtstockGeometry,
  ak_cheek_riser: buildAkCheekRiserGeometry,
  ak_pistol_grip: buildAkPistolGripGeometry,

  // 3. Hammer-Fired FCG & 2023 Ambi Selector (4)
  ak_hammer: buildAkHammerGeometry,
  ak_trigger: buildAkTriggerGeometry,
  ak_disconnector: buildAkDisconnectorGeometry,
  ak_selector: buildAkSelectorGeometry,

  // 4. 30-Rd 7.62×39mm Windowed Curved Magazine (4)
  ak_mag_body: buildAkMagBodyGeometry,
  ak_mag_follower: buildAkMagFollowerGeometry,
  ak_mag_spring: buildAkMagSpringGeometry,
  ak_mag_floorplate: buildAkMagFloorplateGeometry,

  // ==================== BAY-02..BAY-10: 8 New Armory Weapons (199 Parts) ====================
  ...M4A1_MODULE.geometryBuilders,
  ...MP5_MODULE.geometryBuilders,
  ...M82A1_MODULE.geometryBuilders,
  ...AWM_MODULE.geometryBuilders,
  ...SCAR_MODULE.geometryBuilders,
  ...DEAGLE_MODULE.geometryBuilders,
  ...AUG_MODULE.geometryBuilders,
  ...P320_MODULE.geometryBuilders,
};

/**
 * Lazily builds and caches all 253 procedural + CSG BufferGeometries across 10 weapons once per session.
 */
export function getPartGeometry(partId: string): THREE.BufferGeometry {
  const cached = geometryCache.get(partId);
  if (cached) return cached;

  const fn = builders[partId];
  if (!fn) {
    const fallback = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    geometryCache.set(partId, fallback);
    return fallback;
  }

  const geo = fn();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geometryCache.set(partId, geo);
  return geo;
}

/**
 * Computes the local geometric centroid of a cached BufferGeometry so camera fly-to
 * and floating callout badges point to the visual center of each part!
 */
export function getPartLocalCenter(partId: string): [number, number, number] {
  const geo = getPartGeometry(partId);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);
  return [center.x, center.y, center.z];
}

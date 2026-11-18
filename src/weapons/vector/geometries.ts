import type * as THREE from 'three';
import {
  buildVectorBarrelGeometry,
  buildVectorBoltGeometry,
  buildVectorFiringPinGeometry,
  buildVectorGuideRodGeometry,
  buildVectorMagBaseplateGeometry,
  buildVectorMagBodyGeometry,
  buildVectorMagFollowerGeometry,
  buildVectorMagSpringGeometry,
  buildVectorMuzzleDeviceGeometry,
  buildVectorRecoilSpringGeometry,
  buildVectorSliderGeometry,
} from './meshes/vectorGeometries';
import {
  buildVectorChargingHandleGeometry,
  buildVectorFcuChassisGeometry,
  buildVectorFireSelectorGeometry,
  buildVectorFoldingStockGeometry,
  buildVectorFrontSightGeometry,
  buildVectorHammerGeometry,
  buildVectorHammerSpringGeometry,
  buildVectorLowerChassisGeometry,
  buildVectorRearSightGeometry,
  buildVectorStockHingeGeometry,
  buildVectorTakedownPinsGeometry,
  buildVectorThumbSafetyGeometry,
  buildVectorTriggerGeometry,
  buildVectorUpperHousingGeometry,
} from './meshes/vectorExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 5.5" Low-Bore Barrel, Cam-Trunnion Bolt & Patented Super V Vertical Slider ('slide' · 7)
  vector_barrel: buildVectorBarrelGeometry,
  vector_muzzle_device: buildVectorMuzzleDeviceGeometry,
  vector_bolt: buildVectorBoltGeometry,
  vector_firing_pin: buildVectorFiringPinGeometry,
  vector_slider: buildVectorSliderGeometry,
  vector_guide_rod: buildVectorGuideRodGeometry,
  vector_recoil_spring: buildVectorRecoilSpringGeometry,

  // 2. Two-Tier Polymer Housing, Folding Charging Handle, Sights & Gen II Folding Stock ('frame' · 8)
  vector_upper_housing: buildVectorUpperHousingGeometry,
  vector_lower_chassis: buildVectorLowerChassisGeometry,
  vector_charging_handle: buildVectorChargingHandleGeometry,
  vector_front_sight: buildVectorFrontSightGeometry,
  vector_rear_sight: buildVectorRearSightGeometry,
  vector_takedown_pins: buildVectorTakedownPinsGeometry,
  vector_stock_hinge: buildVectorStockHingeGeometry,
  vector_folding_stock: buildVectorFoldingStockGeometry,

  // 3. Inverted Top-Mounted Hammer Pack & Horizontal Pivoting Trigger ('fire_control' · 6)
  vector_fcu_chassis: buildVectorFcuChassisGeometry,
  vector_trigger: buildVectorTriggerGeometry,
  vector_hammer: buildVectorHammerGeometry,
  vector_hammer_spring: buildVectorHammerSpringGeometry,
  vector_fire_selector: buildVectorFireSelectorGeometry,
  vector_thumb_safety: buildVectorThumbSafetyGeometry,

  // 4. Extended 25-Round Kriss MagEx2 .45 ACP Magazine ('magazine' · 4)
  vector_mag_body: buildVectorMagBodyGeometry,
  vector_mag_follower: buildVectorMagFollowerGeometry,
  vector_mag_spring: buildVectorMagSpringGeometry,
  vector_mag_baseplate: buildVectorMagBaseplateGeometry,
};

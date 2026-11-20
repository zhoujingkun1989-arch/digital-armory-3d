import type * as THREE from 'three';
import {
  buildVssBaffleStackGeometry,
  buildVssBarrelGeometry,
  buildVssBoltCarrierGeometry,
  buildVssBoltGeometry,
  buildVssDustCoverGeometry,
  buildVssFiringPinGeometry,
  buildVssForendGeometry,
  buildVssMagBodyGeometry,
  buildVssMagFloorplateGeometry,
  buildVssMagFollowerGeometry,
  buildVssMagSpringGeometry,
  buildVssPso1ScopeGeometry,
  buildVssRearSightGeometry,
  buildVssReceiverGeometry,
  buildVssRecoilGuideGeometry,
  buildVssRecoilSpringGeometry,
  buildVssSafetyLeverGeometry,
  buildVssSearGeometry,
  buildVssSelectorSwitchGeometry,
  buildVssStrikerGeometry,
  buildVssStrikerSpringGeometry,
  buildVssSuppressorTubeGeometry,
  buildVssTriggerGeometry,
  buildVssWoodStockGeometry,
} from './meshes/vssGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Perforated Barrel, 6-Stage Baffle Stack & 6-Lug Rotating Action ('slide' · 7)
  vss_barrel: buildVssBarrelGeometry,
  vss_baffle_stack: buildVssBaffleStackGeometry,
  vss_bolt_carrier: buildVssBoltCarrierGeometry,
  vss_bolt: buildVssBoltGeometry,
  vss_firing_pin: buildVssFiringPinGeometry,
  vss_recoil_guide: buildVssRecoilGuideGeometry,
  vss_recoil_spring: buildVssRecoilSpringGeometry,

  // 2. Milled Receiver, Integral Suppressor, Laminated Thumbhole Stock & PSO-1 Optic ('frame' · 7)
  vss_receiver: buildVssReceiverGeometry,
  vss_dust_cover: buildVssDustCoverGeometry,
  vss_suppressor_tube: buildVssSuppressorTubeGeometry,
  vss_rear_sight: buildVssRearSightGeometry,
  vss_forend: buildVssForendGeometry,
  vss_wood_stock: buildVssWoodStockGeometry,
  vss_pso1_scope: buildVssPso1ScopeGeometry,

  // 3. Linear Striker-Fired Trigger Group, Safety Flap & Cross-Bolt Selector ('fire_control' · 6)
  vss_striker: buildVssStrikerGeometry,
  vss_striker_spring: buildVssStrikerSpringGeometry,
  vss_trigger: buildVssTriggerGeometry,
  vss_sear: buildVssSearGeometry,
  vss_safety_lever: buildVssSafetyLeverGeometry,
  vss_selector_switch: buildVssSelectorSwitchGeometry,

  // 4. 10-Round 9×39mm Soviet Plum Waffle Polymer Magazine ('magazine' · 4)
  vss_mag_body: buildVssMagBodyGeometry,
  vss_mag_follower: buildVssMagFollowerGeometry,
  vss_mag_spring: buildVssMagSpringGeometry,
  vss_mag_floorplate: buildVssMagFloorplateGeometry,
};

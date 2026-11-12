import type * as THREE from 'three';
import {
  buildScarBarrelCrossboltsGeometry,
  buildScarBarrelGeometry,
  buildScarBoltCarrierGeometry,
  buildScarBoltGeometry,
  buildScarChargingHandleGeometry,
  buildScarFiringPinGeometry,
  buildScarFlashSuppressorGeometry,
  buildScarGasBlockGeometry,
  buildScarGasPistonGeometry,
  buildScarRearSightGeometry,
  buildScarRecoilRodGeometry,
  buildScarRecoilSpringGeometry,
  buildScarUpperReceiverGeometry,
} from './meshes/scarGeometries';
import {
  buildScarButtpadGeometry,
  buildScarButtstockGeometry,
  buildScarCheekRiserGeometry,
  buildScarDisconnectorGeometry,
  buildScarHammerGeometry,
  buildScarLowerReceiverGeometry,
  buildScarMagBodyGeometry,
  buildScarMagFloorplateGeometry,
  buildScarMagFollowerGeometry,
  buildScarMagSpringGeometry,
  buildScarPistolGripGeometry,
  buildScarSelectorGeometry,
  buildScarTriggerGeometry,
} from './meshes/scarExtraGeometries';

export const GEOMETRY_BUILDERS: Record<
  string,
  () => THREE.BufferGeometry
> = {
  // 1. Monolithic Upper, Short-Stroke Piston & BCG ('slide' · 10)
  scar_upper_receiver: buildScarUpperReceiverGeometry,
  scar_rear_sight: buildScarRearSightGeometry,
  scar_gas_block: buildScarGasBlockGeometry,
  scar_gas_piston: buildScarGasPistonGeometry,
  scar_bolt_carrier: buildScarBoltCarrierGeometry,
  scar_charging_handle: buildScarChargingHandleGeometry,
  scar_bolt: buildScarBoltGeometry,
  scar_firing_pin: buildScarFiringPinGeometry,
  scar_recoil_rod: buildScarRecoilRodGeometry,
  scar_recoil_spring: buildScarRecoilSpringGeometry,

  // 2. CHF Barrel, Polymer Lower & Ugg-Boot Stock ('frame' · 8)
  scar_lower_receiver: buildScarLowerReceiverGeometry,
  scar_barrel: buildScarBarrelGeometry,
  scar_flash_suppressor: buildScarFlashSuppressorGeometry,
  scar_barrel_crossbolts: buildScarBarrelCrossboltsGeometry,
  scar_pistol_grip: buildScarPistolGripGeometry,
  scar_buttstock: buildScarButtstockGeometry,
  scar_cheek_riser: buildScarCheekRiserGeometry,
  scar_buttpad: buildScarButtpadGeometry,

  // 3. Rotary Hammer FCG & Ambi S-1-A Selector ('fire_control' · 4)
  scar_hammer: buildScarHammerGeometry,
  scar_trigger: buildScarTriggerGeometry,
  scar_disconnector: buildScarDisconnectorGeometry,
  scar_selector: buildScarSelectorGeometry,

  // 4. 30-Rd FDE Tan STANAG Magazine ('magazine' · 4)
  scar_mag_body: buildScarMagBodyGeometry,
  scar_mag_follower: buildScarMagFollowerGeometry,
  scar_mag_spring: buildScarMagSpringGeometry,
  scar_mag_floorplate: buildScarMagFloorplateGeometry,
};

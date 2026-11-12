import type * as THREE from 'three';
import {
  buildAugBarrelLockGeometry,
  buildAugButtpadGeometry,
  buildAugChargingHandleGeometry,
  buildAugForegripGeometry,
  buildAugReceiverOpticGeometry,
  buildAugStockGeometry,
  buildAugTakedownPinGeometry,
} from './meshes/augGeometries';
import {
  buildAugBarrelGeometry,
  buildAugBoltCarrierGeometry,
  buildAugBoltGeometry,
  buildAugFiringPinGeometry,
  buildAugFlashHiderGeometry,
  buildAugGasBlockGeometry,
  buildAugGasPistonGeometry,
  buildAugGasRegulatorGeometry,
  buildAugHammerGeometry,
  buildAugHammerPackGeometry,
  buildAugMagBodyGeometry,
  buildAugMagFloorplateGeometry,
  buildAugMagFollowerGeometry,
  buildAugMagSpringGeometry,
  buildAugRecoilSpringsGeometry,
  buildAugSafetyGeometry,
  buildAugTransferBarsGeometry,
  buildAugTriggerGeometry,
} from './meshes/augExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Quick-Change 20" Barrel, Gas & Twin-Rod Bolt Group ('slide' · 9)
  aug_barrel: buildAugBarrelGeometry,
  aug_flash_hider: buildAugFlashHiderGeometry,
  aug_gas_block: buildAugGasBlockGeometry,
  aug_gas_regulator: buildAugGasRegulatorGeometry,
  aug_gas_piston: buildAugGasPistonGeometry,
  aug_bolt_carrier: buildAugBoltCarrierGeometry,
  aug_bolt: buildAugBoltGeometry,
  aug_firing_pin: buildAugFiringPinGeometry,
  aug_recoil_springs: buildAugRecoilSpringsGeometry,

  // 2. Olive Bullpup Stock & 1.5x Swarovski Optic Receiver ('frame' · 7)
  aug_stock: buildAugStockGeometry,
  aug_buttpad: buildAugButtpadGeometry,
  aug_takedown_pin: buildAugTakedownPinGeometry,
  aug_receiver_optic: buildAugReceiverOpticGeometry,
  aug_barrel_lock: buildAugBarrelLockGeometry,
  aug_charging_handle: buildAugChargingHandleGeometry,
  aug_foregrip: buildAugForegripGeometry,

  // 3. Progressive Trigger, Transfer Bars & Polymer Hammer Pack ('fire_control' · 5)
  aug_trigger: buildAugTriggerGeometry,
  aug_safety: buildAugSafetyGeometry,
  aug_transfer_bars: buildAugTransferBarsGeometry,
  aug_hammer_pack: buildAugHammerPackGeometry,
  aug_hammer: buildAugHammerGeometry,

  // 4. 30-Rd Translucent Amber Waffle Polymer Magazine ('magazine' · 4)
  aug_mag_body: buildAugMagBodyGeometry,
  aug_mag_follower: buildAugMagFollowerGeometry,
  aug_mag_spring: buildAugMagSpringGeometry,
  aug_mag_floorplate: buildAugMagFloorplateGeometry,
};

import type * as THREE from 'three';
import {
  buildRem870ActionBarsGeometry,
  buildRem870ActionReleaseGeometry,
  buildRem870BarrelGeometry,
  buildRem870BreechBoltGeometry,
  buildRem870ButtplateGeometry,
  buildRem870FiringPinGeometry,
  buildRem870FiringPinSpringGeometry,
  buildRem870ForendGeometry,
  buildRem870FrontSightGeometry,
  buildRem870HammerGeometry,
  buildRem870HammerSpringGeometry,
  buildRem870LockingBlockGeometry,
  buildRem870MagCapGeometry,
  buildRem870MagFollowerGeometry,
  buildRem870MagSpringGeometry,
  buildRem870MagTubeGeometry,
  buildRem870RearSightGeometry,
  buildRem870ReceiverGeometry,
  buildRem870ShellCarrierGeometry,
  buildRem870SlideBlockGeometry,
  buildRem870StockBoltGeometry,
  buildRem870TriggerGeometry,
  buildRem870TriggerPlateGeometry,
  buildRem870WalnutStockGeometry,
} from './meshes/rem870Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Barrel, Pump Forend, Twin Action Bars & Tilting-Locking-Block Bolt ('slide' · 8)
  rem870_barrel: buildRem870BarrelGeometry,
  rem870_front_sight: buildRem870FrontSightGeometry,
  rem870_forend: buildRem870ForendGeometry,
  rem870_action_bars: buildRem870ActionBarsGeometry,
  rem870_slide_block: buildRem870SlideBlockGeometry,
  rem870_breech_bolt: buildRem870BreechBoltGeometry,
  rem870_locking_block: buildRem870LockingBlockGeometry,
  rem870_firing_pin: buildRem870FiringPinGeometry,

  // 2. Solid Billet Steel Receiver, Police Sights & Oiled Walnut Stock ('frame' · 5)
  rem870_receiver: buildRem870ReceiverGeometry,
  rem870_rear_sight: buildRem870RearSightGeometry,
  rem870_walnut_stock: buildRem870WalnutStockGeometry,
  rem870_buttplate: buildRem870ButtplateGeometry,
  rem870_stock_bolt: buildRem870StockBoltGeometry,

  // 3. Removable Dual-Pin Trigger Plate, Action Release & Springs ('fire_control' · 6)
  rem870_trigger_plate: buildRem870TriggerPlateGeometry,
  rem870_trigger: buildRem870TriggerGeometry,
  rem870_hammer: buildRem870HammerGeometry,
  rem870_action_release: buildRem870ActionReleaseGeometry,
  rem870_hammer_spring: buildRem870HammerSpringGeometry,
  rem870_firing_pin_spring: buildRem870FiringPinSpringGeometry,

  // 4. Tubular Magazine, High-Vis Follower & Chrome Shell Lifter ('magazine' · 5)
  rem870_mag_tube: buildRem870MagTubeGeometry,
  rem870_mag_cap: buildRem870MagCapGeometry,
  rem870_mag_follower: buildRem870MagFollowerGeometry,
  rem870_mag_spring: buildRem870MagSpringGeometry,
  rem870_shell_carrier: buildRem870ShellCarrierGeometry,
};

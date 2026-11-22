import type * as THREE from 'three';
import {
  buildWin94BarrelBandsGeometry,
  buildWin94BarrelGeometry,
  buildWin94BreechBoltGeometry,
  buildWin94ButtplateGeometry,
  buildWin94CarrierGeometry,
  buildWin94FiringPinGeometry,
  buildWin94ForendGeometry,
  buildWin94FrontSightGeometry,
  buildWin94HammerGeometry,
  buildWin94LeverGeometry,
  buildWin94LinkGeometry,
  buildWin94LoadingGateGeometry,
  buildWin94LockingBoltGeometry,
  buildWin94MagFollowerGeometry,
  buildWin94MagSpringGeometry,
  buildWin94MagTubeGeometry,
  buildWin94MainspringGeometry,
  buildWin94RearSightGeometry,
  buildWin94ReceiverGeometry,
  buildWin94SaddleRingGeometry,
  buildWin94SearSpringGeometry,
  buildWin94TangSafetyGeometry,
  buildWin94TriggerGeometry,
  buildWin94WalnutStockGeometry,
} from './meshes/winchester1894Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Barrel, Breech Bolt, Rising Locking Block & Lever Toggle ('slide' · 7)
  win94_barrel: buildWin94BarrelGeometry,
  win94_front_sight: buildWin94FrontSightGeometry,
  win94_breech_bolt: buildWin94BreechBoltGeometry,
  win94_firing_pin: buildWin94FiringPinGeometry,
  win94_locking_bolt: buildWin94LockingBoltGeometry,
  win94_lever: buildWin94LeverGeometry,
  win94_link: buildWin94LinkGeometry,

  // 2. Top-Eject Forged Receiver, Saddle Ring & Black Walnut Furniture ('frame' · 7)
  win94_receiver: buildWin94ReceiverGeometry,
  win94_rear_sight: buildWin94RearSightGeometry,
  win94_saddle_ring: buildWin94SaddleRingGeometry,
  win94_forend: buildWin94ForendGeometry,
  win94_barrel_bands: buildWin94BarrelBandsGeometry,
  win94_walnut_stock: buildWin94WalnutStockGeometry,
  win94_buttplate: buildWin94ButtplateGeometry,

  // 3. Exposed Hammer, Tang Safety & Helical Mainspring ('fire_control' · 5)
  win94_hammer: buildWin94HammerGeometry,
  win94_trigger: buildWin94TriggerGeometry,
  win94_mainspring: buildWin94MainspringGeometry,
  win94_tang_safety: buildWin94TangSafetyGeometry,
  win94_sear_spring: buildWin94SearSpringGeometry,

  // 4. Full-Length Tubular Magazine, Side Loading Gate & Shell Carrier ('magazine' · 5)
  win94_mag_tube: buildWin94MagTubeGeometry,
  win94_mag_follower: buildWin94MagFollowerGeometry,
  win94_mag_spring: buildWin94MagSpringGeometry,
  win94_loading_gate: buildWin94LoadingGateGeometry,
  win94_carrier: buildWin94CarrierGeometry,
};

import type * as THREE from 'three';
import {
  buildM134AmmoChuteGeometry,
  buildM134BarrelClampGeometry,
  buildM134BarrelClusterGeometry,
  buildM134CamTrackRingGeometry,
  buildM134CarryHandleGeometry,
  buildM134ClutchSpringGeometry,
  buildM134DelinkerHousingGeometry,
  buildM134DelinkerSprocketGeometry,
  buildM134DriveGearGeometry,
  buildM134DriveMotorGeometry,
  buildM134EjectionChuteGeometry,
  buildM134FeederSpringGeometry,
  buildM134FlashSuppressorGeometry,
  buildM134GearHousingGeometry,
  buildM134MainHousingGeometry,
  buildM134MountPintleGeometry,
  buildM134RotaryBoltGeometry,
  buildM134RotorAssemblyGeometry,
  buildM134SafingSectorGeometry,
  buildM134SpadeGripGeometry,
} from './meshes/m134Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 6-Barrel Rotary Cluster, Star-Rotor & 6-Bolt Cam Wave ('slide' · 10)
  m134_barrel_cluster: buildM134BarrelClusterGeometry,
  m134_barrel_clamp: buildM134BarrelClampGeometry,
  m134_flash_suppressor: buildM134FlashSuppressorGeometry,
  m134_rotor_assembly: buildM134RotorAssemblyGeometry,
  m134_bolt_1: buildM134RotaryBoltGeometry,
  m134_bolt_2: buildM134RotaryBoltGeometry,
  m134_bolt_3: buildM134RotaryBoltGeometry,
  m134_bolt_4: buildM134RotaryBoltGeometry,
  m134_bolt_5: buildM134RotaryBoltGeometry,
  m134_bolt_6: buildM134RotaryBoltGeometry,

  // 2. Ribbed Mainframe Housing, 360° Cam Track, Gearbox, Carry Handle & Pintle ('frame' · 5)
  m134_main_housing: buildM134MainHousingGeometry,
  m134_cam_track_ring: buildM134CamTrackRingGeometry,
  m134_gear_housing: buildM134GearHousingGeometry,
  m134_carry_handle: buildM134CarryHandleGeometry,
  m134_mount_pintle: buildM134MountPintleGeometry,

  // 3. 28V DC Electric Drive Motor, Reduction Gear, Clutch Spring, Safing Sector & Spade Grip ('fire_control' · 5)
  m134_drive_motor: buildM134DriveMotorGeometry,
  m134_drive_gear: buildM134DriveGearGeometry,
  m134_clutch_spring: buildM134ClutchSpringGeometry,
  m134_safing_sector: buildM134SafingSectorGeometry,
  m134_spade_grip: buildM134SpadeGripGeometry,

  // 4. Dillon Aero Delinker Feeder, Sprocket, Feeder Spring, Ribbed 7.62mm Ammo Chute & Ejection Port ('magazine' · 5)
  m134_delinker_housing: buildM134DelinkerHousingGeometry,
  m134_delinker_sprocket: buildM134DelinkerSprocketGeometry,
  m134_feeder_spring: buildM134FeederSpringGeometry,
  m134_ammo_chute: buildM134AmmoChuteGeometry,
  m134_ejection_chute: buildM134EjectionChuteGeometry,
};

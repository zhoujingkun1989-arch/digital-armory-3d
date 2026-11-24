import type * as THREE from 'three';
import {
  buildGau8AmmoBeltStackGeometry,
  buildGau8AmmoDrumGeometry,
  buildGau8BarrelClampsGeometry,
  buildGau8BarrelClusterGeometry,
  buildGau8BufferSpringGeometry,
  buildGau8CamTrackGeometry,
  buildGau8ChuteFeedGeometry,
  buildGau8ChuteReturnGeometry,
  buildGau8DrumRotorGeometry,
  buildGau8GunHousingGeometry,
  buildGau8HydraulicMotorsGeometry,
  buildGau8MuzzleClampGeometry,
  buildGau8RecoilBuffersGeometry,
  buildGau8RecoilMountGeometry,
  buildGau8RecoilSpringsGeometry,
  buildGau8RotaryBoltGeometry,
  buildGau8RotorCoreGeometry,
  buildGau8StrikerSpringGeometry,
  buildGau8TransferUnitGeometry,
} from './meshes/gau8Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 7-Barrel Rotary Cluster, Clamps, Star-Rotor & 7 Sinusoidal Cam Bolts ('slide' · 11)
  gau8_barrel_cluster: buildGau8BarrelClusterGeometry,
  gau8_barrel_clamps: buildGau8BarrelClampsGeometry,
  gau8_muzzle_clamp: buildGau8MuzzleClampGeometry,
  gau8_rotor_core: buildGau8RotorCoreGeometry,
  gau8_bolt_1: buildGau8RotaryBoltGeometry,
  gau8_bolt_2: buildGau8RotaryBoltGeometry,
  gau8_bolt_3: buildGau8RotaryBoltGeometry,
  gau8_bolt_4: buildGau8RotaryBoltGeometry,
  gau8_bolt_5: buildGau8RotaryBoltGeometry,
  gau8_bolt_6: buildGau8RotaryBoltGeometry,
  gau8_bolt_7: buildGau8RotaryBoltGeometry,

  // 2. Elliptical-Cam Gun Housing, 360° Cam Track, Titanium Recoil Mount & Buffers ('frame' · 5)
  gau8_gun_housing: buildGau8GunHousingGeometry,
  gau8_cam_track: buildGau8CamTrackGeometry,
  gau8_recoil_mount: buildGau8RecoilMountGeometry,
  gau8_recoil_buffers: buildGau8RecoilBuffersGeometry,
  gau8_recoil_springs: buildGau8RecoilSpringsGeometry,

  // 3. Twin 38.5-HP Hydraulic Drive Motors, Transfer Unit & Buffer/Striker Springs ('fire_control' · 4)
  gau8_hydraulic_motors: buildGau8HydraulicMotorsGeometry,
  gau8_transfer_unit: buildGau8TransferUnitGeometry,
  gau8_buffer_spring: buildGau8BufferSpringGeometry,
  gau8_striker_spring: buildGau8StrikerSpringGeometry,

  // 4. 1,150-Rd Helical Drum, Conveyor Rotor, 30x173mm PGU-14/B Stack & Dual Chutes ('magazine' · 5)
  gau8_ammo_drum: buildGau8AmmoDrumGeometry,
  gau8_drum_rotor: buildGau8DrumRotorGeometry,
  gau8_ammo_belt_stack: buildGau8AmmoBeltStackGeometry,
  gau8_chute_feed: buildGau8ChuteFeedGeometry,
  gau8_chute_return: buildGau8ChuteReturnGeometry,
};

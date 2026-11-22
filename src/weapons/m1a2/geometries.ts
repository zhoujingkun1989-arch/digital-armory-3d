import type * as THREE from 'three';
import {
  buildM1a2Agt1500TurbineGeometry,
  buildM1a2AmmoBustleGeometry,
  buildM1a2BlastDoorsGeometry,
  buildM1a2BlowoffPanelsGeometry,
  buildM1a2BreechBlockGeometry,
  buildM1a2CompositeArmorGeometry,
  buildM1a2CrewStationsGeometry,
  buildM1a2CrowsOpticsGeometry,
  buildM1a2DoorSpringGeometry,
  buildM1a2EngineDeckGeometry,
  buildM1a2FuelCellsGeometry,
  buildM1a2GunMantletGeometry,
  buildM1a2HullShellGeometry,
  buildM1a2MainGunGeometry,
  buildM1a2ReadyRoundGeometry,
  buildM1a2RecoilSpringsGeometry,
  buildM1a2RoadWheelsGeometry,
  buildM1a2SideSkirtsGeometry,
  buildM1a2SmokeLaunchersGeometry,
  buildM1a2StubDeflectorGeometry,
  buildM1a2TorsionBarsGeometry,
  buildM1a2TracksLeftGeometry,
  buildM1a2TracksRightGeometry,
  buildM1a2TurretRingGeometry,
  buildM1a2TurretShellGeometry,
  buildM1a2X1100TransmissionGeometry,
} from './meshes/m1a2Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Dynamic `aSpringParam` CSG Springs (2 parts — SKIPPED in m1a2.glb)
  m1a2_recoil_springs: buildM1a2RecoilSpringsGeometry,
  m1a2_door_spring: buildM1a2DoorSpringGeometry,

  // 2. Suite 1: Hull Armor, Side Skirts, Suspension & Turret Ring (8 solid GLB parts)
  m1a2_hull_shell: buildM1a2HullShellGeometry,
  m1a2_side_skirts: buildM1a2SideSkirtsGeometry,
  m1a2_road_wheels: buildM1a2RoadWheelsGeometry,
  m1a2_tracks_left: buildM1a2TracksLeftGeometry,
  m1a2_tracks_right: buildM1a2TracksRightGeometry,
  m1a2_engine_deck: buildM1a2EngineDeckGeometry,
  m1a2_torsion_bars: buildM1a2TorsionBarsGeometry,
  m1a2_turret_ring: buildM1a2TurretRingGeometry,

  // 3. Suite 2: Turret Armor, Chobham/DU Cheeks, 120mm M256 Gun & CROWS Optics (8 solid GLB parts)
  m1a2_turret_shell: buildM1a2TurretShellGeometry,
  m1a2_blowoff_panels: buildM1a2BlowoffPanelsGeometry,
  m1a2_composite_armor: buildM1a2CompositeArmorGeometry,
  m1a2_main_gun: buildM1a2MainGunGeometry,
  m1a2_gun_mantlet: buildM1a2GunMantletGeometry,
  m1a2_breech_block: buildM1a2BreechBlockGeometry,
  m1a2_crows_optics: buildM1a2CrowsOpticsGeometry,
  m1a2_smoke_launchers: buildM1a2SmokeLaunchersGeometry,

  // 4. Suite 3: Blast Doors, 120mm Bustle Rack, AGT1500 Gas Turbine & Crew Stations (8 solid GLB parts)
  m1a2_blast_doors: buildM1a2BlastDoorsGeometry,
  m1a2_ammo_bustle: buildM1a2AmmoBustleGeometry,
  m1a2_ready_round: buildM1a2ReadyRoundGeometry,
  m1a2_stub_deflector: buildM1a2StubDeflectorGeometry,
  m1a2_agt1500_turbine: buildM1a2Agt1500TurbineGeometry,
  m1a2_x1100_transmission: buildM1a2X1100TransmissionGeometry,
  m1a2_fuel_cells: buildM1a2FuelCellsGeometry,
  m1a2_crew_stations: buildM1a2CrewStationsGeometry,
};

import type * as THREE from 'three';
import {
  buildLeoAmmoBustleGeometry,
  buildLeoArrowheadWedgesGeometry,
  buildLeoBlastDoorGeometry,
  buildLeoBreechBlockGeometry,
  buildLeoBreechSpringGeometry,
  buildLeoCoolingFansGeometry,
  buildLeoCrewStationsGeometry,
  buildLeoEngineDeckGeometry,
  buildLeoGunMantletGeometry,
  buildLeoHullAmmoRackGeometry,
  buildLeoHullShellGeometry,
  buildLeoMainGunGeometry,
  buildLeoMtuV12Geometry,
  buildLeoOpticsPeriGeometry,
  buildLeoReadyRoundGeometry,
  buildLeoRecoilSpringsGeometry,
  buildLeoRecoilSystemGeometry,
  buildLeoRenkTransmissionGeometry,
  buildLeoRoadWheelsGeometry,
  buildLeoSideSkirtsGeometry,
  buildLeoSmokeDischargersGeometry,
  buildLeoTorsionBarsGeometry,
  buildLeoTracksLeftGeometry,
  buildLeoTracksRightGeometry,
  buildLeoTurretRingGeometry,
  buildLeoTurretShellGeometry,
} from './meshes/leopard2a7Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. L/55A1 Main Cannon & Recoil System ('slide' · 4)
  leo_main_gun: buildLeoMainGunGeometry,
  leo_gun_mantlet: buildLeoGunMantletGeometry,
  leo_recoil_system: buildLeoRecoilSystemGeometry,
  leo_recoil_springs: buildLeoRecoilSpringsGeometry,

  // 2. Armored Hull, Turret Shell, Arrowhead Wedges, Running Gear & Smoke ('frame' · 11)
  leo_hull_shell: buildLeoHullShellGeometry,
  leo_side_skirts: buildLeoSideSkirtsGeometry,
  leo_road_wheels: buildLeoRoadWheelsGeometry,
  leo_tracks_left: buildLeoTracksLeftGeometry,
  leo_tracks_right: buildLeoTracksRightGeometry,
  leo_engine_deck: buildLeoEngineDeckGeometry,
  leo_torsion_bars: buildLeoTorsionBarsGeometry,
  leo_turret_ring: buildLeoTurretRingGeometry,
  leo_turret_shell: buildLeoTurretShellGeometry,
  leo_arrowhead_wedges: buildLeoArrowheadWedgesGeometry,
  leo_smoke_dischargers: buildLeoSmokeDischargersGeometry,

  // 3. Breech, PERI/EMES Optics, MTU V12 EuroPowerpack & Crew ('fire_control' · 7)
  leo_breech_block: buildLeoBreechBlockGeometry,
  leo_breech_spring: buildLeoBreechSpringGeometry,
  leo_optics_peri: buildLeoOpticsPeriGeometry,
  leo_mtu_v12: buildLeoMtuV12Geometry,
  leo_renk_transmission: buildLeoRenkTransmissionGeometry,
  leo_cooling_fans: buildLeoCoolingFansGeometry,
  leo_crew_stations: buildLeoCrewStationsGeometry,

  // 4. Bustle Blast Door, 15-Rd Ready Rack, 27-Rd Hull Bunker & Ready Round ('magazine' · 4)
  leo_blast_door: buildLeoBlastDoorGeometry,
  leo_ammo_bustle: buildLeoAmmoBustleGeometry,
  leo_hull_ammo_rack: buildLeoHullAmmoRackGeometry,
  leo_ready_round: buildLeoReadyRoundGeometry,
};

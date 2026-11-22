import type * as THREE from 'three';
import {
  buildTigerAmmoRacksGeometry,
  buildTigerBreechBlockGeometry,
  buildTigerBreechSpringGeometry,
  buildTigerCrewStationsGeometry,
  buildTigerCupolaHatchesGeometry,
  buildTigerDriveshaftGeometry,
  buildTigerEngineDeckGeometry,
  buildTigerFuelTanksGeometry,
  buildTigerGunMantletGeometry,
  buildTigerHullBoxGeometry,
  buildTigerInterleavedWheelsGeometry,
  buildTigerMainGunGeometry,
  buildTigerMaybachV12Geometry,
  buildTigerOpticsTzf9bGeometry,
  buildTigerReadyRoundGeometry,
  buildTigerRecoilCradleGeometry,
  buildTigerRecoilSpringsGeometry,
  buildTigerShellGuardGeometry,
  buildTigerSideFendersGeometry,
  buildTigerTorsionBarsGeometry,
  buildTigerTracksLeftGeometry,
  buildTigerTracksRightGeometry,
  buildTigerTransmissionGeometry,
  buildTigerTurretBasketGeometry,
  buildTigerTurretRingGeometry,
  buildTigerTurretShellGeometry,
} from './meshes/tiger1Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 88mm KwK 36 L/56 Cannon, Mantlet, Recoil Cradle, Recuperator Springs & Shell Guard ('slide' · 5)
  tiger_main_gun: buildTigerMainGunGeometry,
  tiger_gun_mantlet: buildTigerGunMantletGeometry,
  tiger_recoil_cradle: buildTigerRecoilCradleGeometry,
  tiger_recoil_springs: buildTigerRecoilSpringsGeometry,
  tiger_shell_guard: buildTigerShellGuardGeometry,

  // 2. Armored Hull, Horseshoe Turret, Schachtellaufwerk, 725mm Tracks & Chassis ('frame' · 12)
  tiger_hull_box: buildTigerHullBoxGeometry,
  tiger_side_fenders: buildTigerSideFendersGeometry,
  tiger_interleaved_wheels: buildTigerInterleavedWheelsGeometry,
  tiger_tracks_left: buildTigerTracksLeftGeometry,
  tiger_tracks_right: buildTigerTracksRightGeometry,
  tiger_engine_deck: buildTigerEngineDeckGeometry,
  tiger_torsion_bars: buildTigerTorsionBarsGeometry,
  tiger_turret_ring: buildTigerTurretRingGeometry,
  tiger_turret_shell: buildTigerTurretShellGeometry,
  tiger_cupola_hatches: buildTigerCupolaHatchesGeometry,
  tiger_turret_basket: buildTigerTurretBasketGeometry,
  tiger_fuel_tanks: buildTigerFuelTanksGeometry,

  // 3. Krupp Sliding-Wedge Breech, TZF 9b Optics, Maybach HL230 V12, Olvar Gearbox & Crew ('fire_control' · 7)
  tiger_breech_block: buildTigerBreechBlockGeometry,
  tiger_breech_spring: buildTigerBreechSpringGeometry,
  tiger_optics_tzf9b: buildTigerOpticsTzf9bGeometry,
  tiger_maybach_v12: buildTigerMaybachV12Geometry,
  tiger_transmission: buildTigerTransmissionGeometry,
  tiger_driveshaft: buildTigerDriveshaftGeometry,
  tiger_crew_stations: buildTigerCrewStationsGeometry,

  // 4. Sponson 88x571mmR PzGr. 39 Brass Ammo Racks & Chambering Ready Round ('magazine' · 2)
  tiger_ammo_racks: buildTigerAmmoRacksGeometry,
  tiger_ready_round: buildTigerReadyRoundGeometry,
};

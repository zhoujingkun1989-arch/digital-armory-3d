import type * as THREE from 'three';
import {
  buildZtz99aAutoloaderCarouselGeometry,
  buildZtz99aBreechBlockGeometry,
  buildZtz99aCrewStationsGeometry,
  buildZtz99aEraWedgesGeometry,
  buildZtz99aGlacisEraGeometry,
  buildZtz99aGunCradleGeometry,
  buildZtz99aHullArmorGeometry,
  buildZtz99aLoadingTrayGeometry,
  buildZtz99aMainGunGeometry,
  buildZtz99aOpticsCitvGeometry,
  buildZtz99aRammerChainGeometry,
  buildZtz99aRammerSpringGeometry,
  buildZtz99aRearDeckGeometry,
  buildZtz99aRecoilCylindersGeometry,
  buildZtz99aRecoilSpringsGeometry,
  buildZtz99aRoadWheelsGeometry,
  buildZtz99aRoofArmamentsGeometry,
  buildZtz99aSideSkirtsGeometry,
  buildZtz99aStubEjectorGeometry,
  buildZtz99aTorsionBarsGeometry,
  buildZtz99aTracksLeftGeometry,
  buildZtz99aTracksRightGeometry,
  buildZtz99aTransmissionGeometry,
  buildZtz99aTurretRingGeometry,
  buildZtz99aTurretShellGeometry,
  buildZtz99aV12EngineGeometry,
} from './meshes/ztz99aGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // Suite 1: Hull Armor, FY-4 Glacis ERA, Running Gear, Tracks, Rear Deck & Turret Ring (8 solid GLB)
  ztz99a_hull_armor: buildZtz99aHullArmorGeometry,
  ztz99a_glacis_era: buildZtz99aGlacisEraGeometry,
  ztz99a_side_skirts: buildZtz99aSideSkirtsGeometry,
  ztz99a_road_wheels: buildZtz99aRoadWheelsGeometry,
  ztz99a_tracks_left: buildZtz99aTracksLeftGeometry,
  ztz99a_tracks_right: buildZtz99aTracksRightGeometry,
  ztz99a_rear_deck: buildZtz99aRearDeckGeometry,
  ztz99a_turret_ring: buildZtz99aTurretRingGeometry,

  // Suite 2: Turret Shell, Arrowhead FY-4 ERA Wedges, 125mm ZPT-98 Gun, Cradle, Recoil, Breech, CITV/JD-3 & Roof (8 solid GLB)
  ztz99a_turret_shell: buildZtz99aTurretShellGeometry,
  ztz99a_era_wedges: buildZtz99aEraWedgesGeometry,
  ztz99a_main_gun: buildZtz99aMainGunGeometry,
  ztz99a_gun_cradle: buildZtz99aGunCradleGeometry,
  ztz99a_recoil_cylinders: buildZtz99aRecoilCylindersGeometry,
  ztz99a_breech_block: buildZtz99aBreechBlockGeometry,
  ztz99a_optics_citv: buildZtz99aOpticsCitvGeometry,
  ztz99a_roof_armaments: buildZtz99aRoofArmamentsGeometry,

  // Suite 3: Floor Carousel Autoloader, Hoist Tray, Chain Rammer, Stub Ejector, 150HB V12, CH-1000, Torsion Bars & Crew (8 solid GLB)
  ztz99a_autoloader_carousel: buildZtz99aAutoloaderCarouselGeometry,
  ztz99a_loading_tray: buildZtz99aLoadingTrayGeometry,
  ztz99a_rammer_chain: buildZtz99aRammerChainGeometry,
  ztz99a_stub_ejector: buildZtz99aStubEjectorGeometry,
  ztz99a_v12_engine: buildZtz99aV12EngineGeometry,
  ztz99a_transmission: buildZtz99aTransmissionGeometry,
  ztz99a_torsion_bars: buildZtz99aTorsionBarsGeometry,
  ztz99a_crew_stations: buildZtz99aCrewStationsGeometry,

  // Dynamic aSpringParam CSG Helical Springs (2 parts — skipped in ztz99a.glb)
  ztz99a_recoil_springs: buildZtz99aRecoilSpringsGeometry,
  ztz99a_rammer_spring: buildZtz99aRammerSpringGeometry,
};

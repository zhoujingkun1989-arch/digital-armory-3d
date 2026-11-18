import type * as THREE from 'three';
import {
  buildPythonBarrelGeometry,
  buildPythonBarrelPinGeometry,
  buildPythonCylinderLatchGeometry,
  buildPythonDetentPlungerGeometry,
  buildPythonFrameGeometry,
  buildPythonFrontSightGeometry,
  buildPythonGripLeftGeometry,
  buildPythonGripRightGeometry,
  buildPythonRearSightGeometry,
  buildPythonSideplateGeometry,
  buildPythonSideplateScrewsGeometry,
} from './meshes/pythonGeometries';
import {
  buildPythonCraneGeometry,
  buildPythonCylinderBoltGeometry,
  buildPythonCylinderGeometry,
  buildPythonExtractorRodGeometry,
  buildPythonExtractorSpringGeometry,
  buildPythonExtractorStarGeometry,
  buildPythonFiringPinGeometry,
  buildPythonHammerGeometry,
  buildPythonHammerStirrupGeometry,
  buildPythonHandGeometry,
  buildPythonMainspringGeometry,
  buildPythonReboundLeverGeometry,
  buildPythonSpeedloaderGeometry,
  buildPythonTriggerGeometry,
} from './meshes/pythonExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. 6" Ventilated-Rib & Full-Underlug Barrel & Target Sight Assembly ('slide' · 5)
  python_barrel: buildPythonBarrelGeometry,
  python_front_sight: buildPythonFrontSightGeometry,
  python_rear_sight: buildPythonRearSightGeometry,
  python_barrel_pin: buildPythonBarrelPinGeometry,
  python_detent_plunger: buildPythonDetentPlungerGeometry,

  // 2. Forged Colt I-Frame, Removable Sideplate & Walnut Target Grips ('frame' · 6)
  python_frame: buildPythonFrameGeometry,
  python_sideplate: buildPythonSideplateGeometry,
  python_sideplate_screws: buildPythonSideplateScrewsGeometry,
  python_grip_left: buildPythonGripLeftGeometry,
  python_grip_right: buildPythonGripRightGeometry,
  python_cylinder_latch: buildPythonCylinderLatchGeometry,

  // 3. DA/SA Clockwork & Folded V-Leaf Lockwork ('fire_control' · 8)
  python_hammer: buildPythonHammerGeometry,
  python_hammer_stirrup: buildPythonHammerStirrupGeometry,
  python_trigger: buildPythonTriggerGeometry,
  python_mainspring: buildPythonMainspringGeometry,
  python_rebound_lever: buildPythonReboundLeverGeometry,
  python_cylinder_bolt: buildPythonCylinderBoltGeometry,
  python_hand: buildPythonHandGeometry,
  python_firing_pin: buildPythonFiringPinGeometry,

  // 4. Swing-Out 6-Chamber .357 Cylinder, Extractor Star & Speedloader ('magazine' · 6)
  python_crane: buildPythonCraneGeometry,
  python_cylinder: buildPythonCylinderGeometry,
  python_extractor_star: buildPythonExtractorStarGeometry,
  python_extractor_rod: buildPythonExtractorRodGeometry,
  python_extractor_spring: buildPythonExtractorSpringGeometry,
  python_speedloader: buildPythonSpeedloaderGeometry,
};

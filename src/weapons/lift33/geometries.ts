import type * as THREE from 'three';
import {
  buildLift33ArrowShaftGeometry,
  buildLift33BroadheadGeometry,
  buildLift33DLoopGeometry,
  buildLift33DropAwayRestGeometry,
  buildLift33LauncherForkGeometry,
  buildLift33QuiverFrameGeometry,
  buildLift33QuiverHoodGeometry,
  buildLift33QuiverLatchGeometry,
  buildLift33SightHousingGeometry,
  buildLift33SightPinsGeometry,
} from './meshes/lift33ExtraGeometries';
import {
  buildLift33BowstringGeometry,
  buildLift33CableGuardGeometry,
  buildLift33CamAxlesGeometry,
  buildLift33GripGeometry,
  buildLift33LimbDampenersGeometry,
  buildLift33LowerCamGeometry,
  buildLift33LowerLimbsGeometry,
  buildLift33LowerPocketGeometry,
  buildLift33RiserGeometry,
  buildLift33StabilizerGeometry,
  buildLift33UpperCamGeometry,
  buildLift33UpperLimbsGeometry,
  buildLift33UpperPocketGeometry,
  buildLift33YokeCablesGeometry,
} from './meshes/lift33Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Bridged Truss Riser, Grip, Pockets, Cable Guard & Stabilizer ('frame' · 6)
  lift33_riser: buildLift33RiserGeometry,
  lift33_grip: buildLift33GripGeometry,
  lift33_upper_pocket: buildLift33UpperPocketGeometry,
  lift33_lower_pocket: buildLift33LowerPocketGeometry,
  lift33_cable_guard: buildLift33CableGuardGeometry,
  lift33_stabilizer: buildLift33StabilizerGeometry,

  // 2. Split Quad Limbs, SwitchWeight-X Binary Cams & Flexing Cables ('slide' · 8)
  lift33_upper_limbs: buildLift33UpperLimbsGeometry,
  lift33_lower_limbs: buildLift33LowerLimbsGeometry,
  lift33_upper_cam: buildLift33UpperCamGeometry,
  lift33_lower_cam: buildLift33LowerCamGeometry,
  lift33_cam_axles: buildLift33CamAxlesGeometry,
  lift33_bowstring: buildLift33BowstringGeometry,
  lift33_yoke_cables: buildLift33YokeCablesGeometry,
  lift33_limb_dampeners: buildLift33LimbDampenersGeometry,

  // 3. Sight, Drop-Away Rest & Release D-Loop ('fire_control' · 5)
  lift33_drop_away_rest: buildLift33DropAwayRestGeometry,
  lift33_launcher_fork: buildLift33LauncherForkGeometry,
  lift33_sight_housing: buildLift33SightHousingGeometry,
  lift33_sight_pins: buildLift33SightPinsGeometry,
  lift33_d_loop: buildLift33DLoopGeometry,

  // 4. Detachable 5-Arrow Quiver & Match Carbon Hunting Arrow ('magazine' · 5)
  lift33_quiver_frame: buildLift33QuiverFrameGeometry,
  lift33_quiver_hood: buildLift33QuiverHoodGeometry,
  lift33_quiver_latch: buildLift33QuiverLatchGeometry,
  lift33_arrow_shaft: buildLift33ArrowShaftGeometry,
  lift33_broadhead: buildLift33BroadheadGeometry,
};

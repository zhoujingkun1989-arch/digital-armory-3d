import type * as THREE from 'three';
import {
  buildR500ButtstockGeometry,
  buildR500CamAxlesGeometry,
  buildR500ChassisGeometry,
  buildR500FlightRailGeometry,
  buildR500FootStirrupGeometry,
  buildR500ForendGripGeometry,
  buildR500LeftCamGeometry,
  buildR500LeftLimbsGeometry,
  buildR500PistolGripGeometry,
  buildR500RightCamGeometry,
  buildR500RightLimbsGeometry,
  buildR500RiserHeadGeometry,
} from './meshes/r500Geometries';
import {
  buildR500AntiDryFireGeometry,
  buildR500BowstringGeometry,
  buildR500CarbonBoltGeometry,
  buildR500PowerCablesGeometry,
  buildR500QuiverFrameGeometry,
  buildR500RetentionArmGeometry,
  buildR500SafetySelectorGeometry,
  buildR500ScopeGeometry,
  buildR500StringLatchGeometry,
  buildR500TriggerSearGeometry,
  buildR500TriggerSledGeometry,
  buildR500TriggerSpringGeometry,
  buildR500VersaDriveScrewGeometry,
} from './meshes/r500ExtraGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Bullpup Mainframe Chassis, Forend, Stock, Stirrup & Optical Bridge ('frame' · 6)
  r500_chassis: buildR500ChassisGeometry,
  r500_forend_grip: buildR500ForendGripGeometry,
  r500_pistol_grip: buildR500PistolGripGeometry,
  r500_buttstock: buildR500ButtstockGeometry,
  r500_foot_stirrup: buildR500FootStirrupGeometry,
  r500_flight_rail: buildR500FlightRailGeometry,

  // 2. HexCoil 360° Helical Cams, Horizontal Quad Limbs & VersaDrive ('slide' · 9)
  r500_riser_head: buildR500RiserHeadGeometry,
  r500_left_limbs: buildR500LeftLimbsGeometry,
  r500_right_limbs: buildR500RightLimbsGeometry,
  r500_left_cam: buildR500LeftCamGeometry,
  r500_right_cam: buildR500RightCamGeometry,
  r500_cam_axles: buildR500CamAxlesGeometry,
  r500_bowstring: buildR500BowstringGeometry,
  r500_power_cables: buildR500PowerCablesGeometry,
  r500_versadrive_screw: buildR500VersaDriveScrewGeometry,

  // 3. Trac-Trigger Floating Sled, Anti-Dry-Fire & Sear ('fire_control' · 6)
  r500_trigger_sled: buildR500TriggerSledGeometry,
  r500_string_latch: buildR500StringLatchGeometry,
  r500_anti_dry_fire: buildR500AntiDryFireGeometry,
  r500_trigger_sear: buildR500TriggerSearGeometry,
  r500_safety_selector: buildR500SafetySelectorGeometry,
  r500_trigger_spring: buildR500TriggerSpringGeometry,

  // 4. 100-Yd Crossbow Scope, Arrow Retention Arm, 3-Bolt Quiver & 500 FPS Bolt ('magazine' · 4)
  r500_scope: buildR500ScopeGeometry,
  r500_quiver_frame: buildR500QuiverFrameGeometry,
  r500_retention_arm: buildR500RetentionArmGeometry,
  r500_carbon_bolt: buildR500CarbonBoltGeometry,
};

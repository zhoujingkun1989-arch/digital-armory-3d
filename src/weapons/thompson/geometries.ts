import type * as THREE from 'three';
import {
  buildThompsonActuatorGeometry,
  buildThompsonBarrelGeometry,
  buildThompsonBlishLockGeometry,
  buildThompsonBoltGeometry,
  buildThompsonBufferPilotGeometry,
  buildThompsonButtplateGeometry,
  buildThompsonButtstockGeometry,
  buildThompsonCuttsCompGeometry,
  buildThompsonDrumMagGeometry,
  buildThompsonDrumRotorGeometry,
  buildThompsonDrumRoundsGeometry,
  buildThompsonDrumSpringGeometry,
  buildThompsonForegripGeometry,
  buildThompsonHammerPinGeometry,
  buildThompsonLowerFrameGeometry,
  buildThompsonLymanSightGeometry,
  buildThompsonMagCatchGeometry,
  buildThompsonOilerGeometry,
  buildThompsonPistolGripGeometry,
  buildThompsonReceiverGeometry,
  buildThompsonRecoilSpringGeometry,
  buildThompsonSearGeometry,
  buildThompsonSearSpringGeometry,
  buildThompsonSelectorLeversGeometry,
  buildThompsonTriggerGeometry,
} from './meshes/thompsonGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Finned Barrel, Cutts Compensator & Bronze Blish-Lock Bolt Group ('slide' · 9)
  thompson_barrel: buildThompsonBarrelGeometry,
  thompson_cutts_comp: buildThompsonCuttsCompGeometry,
  thompson_bolt: buildThompsonBoltGeometry,
  thompson_blish_lock: buildThompsonBlishLockGeometry,
  thompson_actuator: buildThompsonActuatorGeometry,
  thompson_hammer_pin: buildThompsonHammerPinGeometry,
  thompson_buffer_pilot: buildThompsonBufferPilotGeometry,
  thompson_recoil_spring: buildThompsonRecoilSpringGeometry,
  thompson_oiler: buildThompsonOilerGeometry,

  // 2. Milled Billet Receiver, Lyman Ladder Sight, Lower Frame & Walnut Furniture ('frame' · 7)
  thompson_receiver: buildThompsonReceiverGeometry,
  thompson_lyman_sight: buildThompsonLymanSightGeometry,
  thompson_lower_frame: buildThompsonLowerFrameGeometry,
  thompson_foregrip: buildThompsonForegripGeometry,
  thompson_pistol_grip: buildThompsonPistolGripGeometry,
  thompson_buttstock: buildThompsonButtstockGeometry,
  thompson_buttplate: buildThompsonButtplateGeometry,

  // 3. Select-Fire Sear, Twin Paddle Selectors & Mag Catch ('fire_control' · 5)
  thompson_trigger: buildThompsonTriggerGeometry,
  thompson_sear: buildThompsonSearGeometry,
  thompson_selector_levers: buildThompsonSelectorLeversGeometry,
  thompson_mag_catch: buildThompsonMagCatchGeometry,
  thompson_sear_spring: buildThompsonSearSpringGeometry,

  // 4. 50-Round Type L Clockwork Drum Magazine, 4-Arm Rotor & .45 ACP Spiral Track ('magazine' · 4)
  thompson_drum_mag: buildThompsonDrumMagGeometry,
  thompson_drum_rotor: buildThompsonDrumRotorGeometry,
  thompson_drum_rounds: buildThompsonDrumRoundsGeometry,
  thompson_drum_spring: buildThompsonDrumSpringGeometry,
};

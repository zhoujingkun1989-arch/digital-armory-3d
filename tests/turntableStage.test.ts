import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WEAPON_TURNTABLE_BOUNDS,
  computeTurntableFraming,
  evaluateWeaponTurntableEnvelopeInto,
  setShowcaseWindowBounds,
} from '../src/engine/canvas/turntableStageMetrics';
import { computePartTransform } from '../src/engine/kinematics/math';
import { ARMORY_WEAPONS, getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';

describe('turntable stage framing & zero-overlap showcase window contract', () => {
  afterEach(() => {
    setShowcaseWindowBounds(null);
  });

  it('keeps all 11 firearms (278 parts) and 3D turntable platters strictly inside the unobstructed Showcase window across 360° rotation', async () => {
    const viewports = [
      { w: 1440, h: 720, topPx: 252, bottomPx: 622 },
      { w: 1920, h: 1080, topPx: 268, bottomPx: 980 },
      { w: 390, h: 844, topPx: 340, bottomPx: 610 },
    ];
    const explodeStates = [0, 0.58];
    const azimuthAngles = [
      0,
      Math.PI * 0.25,
      Math.PI * 0.5,
      Math.PI * 0.75,
      Math.PI,
      Math.PI * 1.25,
      Math.PI * 1.5,
      Math.PI * 1.75,
    ];

    const plugins = await Promise.all(
      ARMORY_WEAPONS.map((w) => loadWeaponPlugin(w.id))
    );
    const v = new THREE.Vector3();

    for (const vp of viewports) {
      setShowcaseWindowBounds({ topPx: vp.topPx, bottomPx: vp.bottomPx });

      for (let wi = 0; wi < ARMORY_WEAPONS.length; wi++) {
        const weapon = ARMORY_WEAPONS[wi];
        const plugin = plugins[wi];
        expect(WEAPON_TURNTABLE_BOUNDS[weapon.id]).toBeDefined();

        const scaleProfile = getWeaponManifest(weapon.id).workbenchMeta
          .scaleProfile;

        for (const t of explodeStates) {
          const env = evaluateWeaponTurntableEnvelopeInto(weapon.id, t);
          const tf = computeTurntableFraming(
            weapon.id,
            scaleProfile,
            t,
            'showcase',
            vp.w,
            vp.h
          );

          const cam = new THREE.PerspectiveCamera(41, vp.w / vp.h, 0.1, 400);
          cam.setViewOffset(
            vp.w,
            vp.h,
            tf.viewOffsetX,
            tf.viewOffsetY,
            vp.w,
            vp.h
          );

          // Precompute real part positions at explodeT
          const samplePoints: [number, number, number][] = [];
          for (const part of plugin.parts) {
            const { position } = computePartTransform(part, t);
            samplePoints.push([position[0], position[1], position[2]]);
          }
          // Add central vertical extrema (magazine/grip floor & optic/sight crown)
          samplePoints.push(
            [env.cx, env.minY, 0],
            [env.cx, env.maxY, 0],
            [env.cx - env.spanX * 0.5, 0, 0],
            [env.cx + env.spanX * 0.5, 0, 0]
          );
          // Add 16 perimeter points of the 3D exhibition turntable platter & bevel skirt
          for (let k = 0; k < 16; k++) {
            const phi = (k / 16) * Math.PI * 2;
            samplePoints.push([
              env.cx + Math.cos(phi) * env.radius * 1.045,
              env.platterTopY - 0.55,
              Math.sin(phi) * env.radius * 1.045,
            ]);
          }

          for (const theta of azimuthAngles) {
            cam.position.set(
              tf.targetX + Math.sin(theta) * tf.horizRadius,
              tf.targetY + tf.offsetY,
              tf.targetZ + Math.cos(theta) * tf.horizRadius
            );
            cam.lookAt(tf.targetX, tf.targetY, tf.targetZ);
            cam.updateMatrixWorld();

            let minScreenY = Infinity;
            let maxScreenY = -Infinity;

            for (const [px, py, pz] of samplePoints) {
              v.set(px, py, pz).project(cam);
              const sy = (1 - v.y) * 0.5 * vp.h;
              if (sy < minScreenY) minScreenY = sy;
              if (sy > maxScreenY) maxScreenY = sy;
            }

            expect(minScreenY).toBeGreaterThan(vp.topPx + 10);
            expect(maxScreenY).toBeLessThan(vp.bottomPx - 10);
          }
        }
      }
    }
  });
});

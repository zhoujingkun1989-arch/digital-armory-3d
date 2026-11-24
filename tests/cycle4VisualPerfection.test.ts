import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildThermalGeometries } from '../src/engine/actors/AttachmentActor';
import {
  SMALL_ARMS_RULER_LEFT_X,
  SMALL_ARMS_RULER_RIGHT_X,
} from '../src/engine/actors/CartridgeCutawayStage';
import {
  enforceUpperHemisphereClamp,
  resolveStrictCalloutHemisphere,
  UPPER_HEMISPHERE_LOCK_MARGIN_PX,
} from '../src/engine/callout/CalloutOverlay';
import { ARMORY_ENVIRONMENTS } from '../src/engine/canvas/GunsmithStageMat';
import { STUDIO_SOFTBOX_REFLECTION_CARDS } from '../src/engine/canvas/studioHdriManager';
import { CARTRIDGE_LAB_SPECS } from '../src/engine/cartridges/cartridgeSpecs';

const REPO_ROOT = path.resolve(__dirname, '..');

function assertFiniteBufferGeometry(
  geo: THREE.BufferGeometry,
  label: string
): void {
  const pos = geo.getAttribute('position');
  expect(pos, `${label} position attribute`).toBeDefined();
  expect(pos.count, `${label} vertex count`).toBeGreaterThan(0);
  for (let i = 0; i < pos.array.length; i += 1) {
    expect(Number.isFinite(pos.array[i]), `${label} pos[${i}] finite`).toBe(
      true
    );
  }
  const norm = geo.getAttribute('normal');
  expect(norm, `${label} normal attribute`).toBeDefined();
  for (let i = 0; i < norm.array.length; i += 1) {
    expect(Number.isFinite(norm.array[i]), `${label} norm[${i}] finite`).toBe(
      true
    );
  }
}

describe('Cycle 4A — 9.8/10 3D Visual Perfection Contracts', () => {
  it('places mid-elevation horizontal chrome softbox ribbons (y in [0, 5]) in both PMREM cards & studio lightformers', () => {
    for (const preset of ['tactical_vault', 'gunsmith_bench'] as const) {
      const cards = STUDIO_SOFTBOX_REFLECTION_CARDS[preset];
      const frontMid = cards.find(
        (c) =>
          c.id === 'front_mid_chrome_ribbon' &&
          c.position[1] >= 0 &&
          c.position[1] <= 5 &&
          c.position[2] > 20
      );
      const rearMid = cards.find(
        (c) =>
          c.id === 'rear_mid_chrome_ribbon' &&
          c.position[1] >= 0 &&
          c.position[1] <= 5 &&
          c.position[2] < -20
      );

      expect(frontMid, `${preset} front mid-elevation chrome ribbon`).toBeDefined();
      expect(rearMid, `${preset} rear mid-elevation chrome ribbon`).toBeDefined();
      expect(frontMid!.scale[0]).toBeGreaterThanOrEqual(50);
      expect(frontMid!.radiance[0]).toBeGreaterThanOrEqual(2.2);
      expect(frontMid!.radiance[1]).toBeGreaterThanOrEqual(2.2);
      expect(frontMid!.radiance[2]).toBeGreaterThanOrEqual(2.2);

      // Matching mid-elevation procedural Lightformers for dark studio environments
      const env = ARMORY_ENVIRONMENTS[preset];
      const frontMidLf = env.lightformers.find(
        (lf) =>
          lf.position[1] >= 0 &&
          lf.position[1] <= 5 &&
          lf.position[2] > 18 &&
          lf.scale[0] >= 44
      );
      const rearMidLf = env.lightformers.find(
        (lf) =>
          lf.position[1] >= 0 &&
          lf.position[1] <= 5 &&
          lf.position[2] < -18 &&
          lf.scale[0] >= 44
      );
      expect(frontMidLf, `${preset} front mid Lightformer`).toBeDefined();
      expect(rearMidLf, `${preset} rear mid Lightformer`).toBeDefined();
    }
  });

  it('uses camera-facing THREE.Sprite billboards with leader ticks and full GPU disposal in ArmorPenetration3DScene', () => {
    const src = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'src',
        'features',
        'armorlab',
        'ArmorPenetration3DScene.tsx'
      ),
      'utf8'
    );

    expect(src).toContain('new THREE.SpriteMaterial(');
    expect(src).toContain('<sprite');
    expect(src).toContain('ArmorLayerBillboard-');
    expect(src).toContain('badgeSpriteMat?.dispose()');
    expect(src).toContain('badgeTex?.dispose()');
    // Legacy skewed planar armor badge mesh must be replaced
    expect(src).not.toContain('<planeGeometry args={[14.5, 5.0]} />');
  });

  it('gives .50 BMG >= 2.0 cm center clearance from the small-arms right elevation ruler', () => {
    const bmg50 = CARTRIDGE_LAB_SPECS['50_bmg'];
    const centerClearanceCm = SMALL_ARMS_RULER_RIGHT_X - bmg50.lineupXCm;
    const rimRadiusCm = bmg50.rimDiameterMm / 20;
    const edgeClearanceCm =
      SMALL_ARMS_RULER_RIGHT_X - (bmg50.lineupXCm + rimRadiusCm);

    expect(SMALL_ARMS_RULER_LEFT_X).toBeLessThan(-21);
    expect(SMALL_ARMS_RULER_RIGHT_X).toBeGreaterThanOrEqual(23.5);
    expect(centerClearanceCm).toBeGreaterThanOrEqual(2.0);
    expect(edgeClearanceCm).toBeGreaterThanOrEqual(1.5);
  });

  it('builds sculpted dark-anodized FLIR thermal scope geometries (fins, turrets, focus ring, hood, pleated eyecup, CT internals) and disposes cleanly', () => {
    const thermal = buildThermalGeometries();
    try {
      const expectedKeys: (keyof typeof thermal)[] = [
        'railBase',
        'qdLever',
        'chassisOuter',
        'chassisTopDeck',
        'coolingFin',
        'turretCap',
        'focusRing',
        'lensHood',
        'germaniumLens',
        'batteryPod',
        'batteryCap',
        'keypadButton',
        'eyecup',
        'voxSensor',
        'dspPcb',
        'oledPrism',
      ];
      for (const key of expectedKeys) {
        assertFiniteBufferGeometry(thermal[key], `thermal.${key}`);
      }

      // Sculpted beveled CNC chassis & multi-bellows pleated accordion eyecup (far richer than plain primitives)
      expect(thermal.chassisOuter.getAttribute('position').count).toBeGreaterThan(
        100
      );
      expect(thermal.eyecup.getAttribute('position').count).toBeGreaterThan(400);
      expect(thermal.lensHood.getAttribute('position').count).toBeGreaterThan(
        250
      );
    } finally {
      Object.values(thermal).forEach((g) => g.dispose());
    }

    const attSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'engine', 'actors', 'AttachmentActor.tsx'),
      'utf8'
    );
    expect(attSrc).toContain('THERMAL_FIN_XS');
    expect(attSrc).toContain('thermalGeos.coolingFin');
    expect(attSrc).toContain('thermalGeos.turretCap');
    expect(attSrc).toContain('thermalGeos.focusRing');
    expect(attSrc).toContain('thermalGeos.eyecup');
    expect(attSrc).toContain(
      'if (thermalGeos) Object.values(thermalGeos).forEach((g) => g.dispose());'
    );
  });

  it('enforces strict upper-hemisphere callout clamping (sy < midY - 24 -> top) without downward silhouette crossings', () => {
    expect(UPPER_HEMISPHERE_LOCK_MARGIN_PX).toBe(24);
    const midY = 520;

    // Upper-half anchors (e.g. AK-15 recoil spring, ZTZ-99A CITV) strictly resolve to 'top'
    expect(resolveStrictCalloutHemisphere(midY - 25, midY, 'down')).toBe('top');
    expect(resolveStrictCalloutHemisphere(midY - 120, midY, 'down')).toBe(
      'top'
    );
    // Lower-half anchors resolve to 'bottom'
    expect(resolveStrictCalloutHemisphere(midY + 30, midY, 'up')).toBe(
      'bottom'
    );
    // Midline band preserves part preferredDir
    expect(resolveStrictCalloutHemisphere(midY - 8, midY, 'down')).toBe(
      'bottom'
    );
    expect(resolveStrictCalloutHemisphere(midY + 8, midY, 'up')).toBe('top');

    // Clamp prevents any relaxed/fallback downward label Y from crossing below weaponMidY - clearPad
    const clamped = enforceUpperHemisphereClamp(
      midY - 65,
      midY,
      midY + 180,
      76,
      24
    );
    expect(clamped.lockedUpper).toBe(true);
    expect(clamped.hemisphere).toBe('top');
    expect(clamped.clampedY).toBeLessThanOrEqual(midY - 24);
    expect(clamped.clampedY).toBeGreaterThanOrEqual(76);

    // Lower-half anchor is not upper-locked
    const lower = enforceUpperHemisphereClamp(
      midY + 80,
      midY,
      midY + 160,
      76,
      24
    );
    expect(lower.lockedUpper).toBe(false);
    expect(lower.hemisphere).toBe('bottom');
    expect(lower.clampedY).toBe(midY + 160);

    // Verify CalloutOverlay guards fallback flip & relaxation against pushing lockedUpper downward
    const calloutSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'engine', 'callout', 'CalloutOverlay.tsx'),
      'utf8'
    );
    expect(calloutSrc).toContain('if (bestCost === Infinity && !lockedUpper)');
    expect(calloutSrc).toContain('relaxLockedUpper');
  });
});

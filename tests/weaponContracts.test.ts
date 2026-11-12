import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createMutablePose,
  evaluatePartPoseInto,
} from '../src/engine/kinematics/math';
import { normalizeTextureFileName } from '../src/engine/utils/assetUrl';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponGeometryBuilders } from '../src/weapons/geometryLoaders';
import {
  ARMORY_WEAPONS,
  matchesArmoryCategory,
  WEAPON_MANIFESTS,
} from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { CameraPresetType, WeaponId } from '../src/weapons/types';

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const TEXTURES_DIR = path.join(ROOT_DIR, 'public', 'textures');

const CAMERA_PRESET_KEYS: readonly CameraPresetType[] = [
  'armory_showcase',
  'iso',
  'right',
  'left',
  'top',
  'cutaway_focus',
  'firing_view',
];

const DENSE_FIRING_SWEEP: readonly number[] = Array.from(
  { length: 51 },
  (_, i) => Number((i * 0.02).toFixed(2))
);

const DYNAMIC_SPRING_PARTS: Readonly<Record<WeaponId, readonly string[]>> = {
  ak15: ['ak_recoil_spring'],
  m4a1: ['m4a1_buffer_spring'],
  mp5: ['mp5_recoil_spring'],
  g17: ['recoil_spring', 'striker_spring'],
  m82a1: ['m82a1_recoil_spring', 'm82a1_barrel_springs'],
  awm: ['awm_firing_pin_spring'],
  scar: ['scar_recoil_spring'],
  deagle: ['deagle_recoil_springs'],
  aug: ['aug_recoil_springs'],
  p320: ['p320_recoil_spring', 'p320_striker_spring'],
};

const ROTATING_BOLT_PARTS: ReadonlyArray<{
  weaponId: WeaponId;
  partId: string;
  minAbsRollRad: number;
}> = [
  { weaponId: 'ak15', partId: 'ak_bolt', minAbsRollRad: 0.25 },
  { weaponId: 'm4a1', partId: 'm4a1_bolt', minAbsRollRad: 0.25 },
  { weaponId: 'scar', partId: 'scar_bolt', minAbsRollRad: 0.25 },
  { weaponId: 'aug', partId: 'aug_bolt', minAbsRollRad: 0.25 },
  { weaponId: 'deagle', partId: 'deagle_bolt', minAbsRollRad: 0.25 },
  { weaponId: 'awm', partId: 'awm_bolt_body', minAbsRollRad: 0.85 },
  { weaponId: 'm82a1', partId: 'm82a1_bolt', minAbsRollRad: 0.25 },
];

const FIXED_BARREL_PARTS: ReadonlyArray<{
  weaponId: WeaponId;
  partId: string;
}> = [
  { weaponId: 'ak15', partId: 'ak_barrel' },
  { weaponId: 'm4a1', partId: 'm4a1_barrel' },
  { weaponId: 'mp5', partId: 'mp5_barrel' },
  { weaponId: 'awm', partId: 'awm_barrel' },
  { weaponId: 'scar', partId: 'scar_barrel' },
  { weaponId: 'deagle', partId: 'deagle_barrel' },
  { weaponId: 'aug', partId: 'aug_barrel' },
];

interface ParsedWebpHeader {
  chunkFourCC: 'VP8 ' | 'VP8L' | 'VP8X';
  width: number;
  height: number;
  hasAlpha: boolean;
}

function parseWebpHeader(buf: Buffer, fileName: string): ParsedWebpHeader {
  if (buf.length < 30) {
    throw new Error(`${fileName}: WebP buffer too short (${buf.length} bytes)`);
  }
  const riff = buf.toString('ascii', 0, 4);
  const riffSize = buf.readUInt32LE(4);
  const webp = buf.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new Error(
      `${fileName}: invalid RIFF/WEBP magic (${riff}/${webp})`
    );
  }
  if (riffSize + 8 > buf.length) {
    throw new Error(
      `${fileName}: truncated RIFF payload (${riffSize + 8} > ${buf.length})`
    );
  }

  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    const isInterFrame = (buf[20] & 0x01) !== 0;
    const syncOk =
      buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a;
    if (isInterFrame || !syncOk) {
      throw new Error(`${fileName}: invalid VP8 keyframe sync header`);
    }
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { chunkFourCC: 'VP8 ', width, height, hasAlpha: false };
  }

  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) {
      throw new Error(
        `${fileName}: invalid VP8L signature byte 0x${buf[20].toString(16)}`
      );
    }
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    const hasAlpha = ((bits >>> 28) & 0x01) === 1;
    const version = (bits >>> 29) & 0x07;
    if (version !== 0) {
      throw new Error(`${fileName}: unsupported VP8L version ${version}`);
    }
    return { chunkFourCC: 'VP8L', width, height, hasAlpha };
  }

  if (chunk === 'VP8X') {
    const flags = buf[20];
    const hasAlpha = (flags & 0x10) !== 0;
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { chunkFourCC: 'VP8X', width, height, hasAlpha };
  }

  throw new Error(`${fileName}: unexpected first WebP chunk "${chunk}"`);
}

function findFirstNonFiniteIndex(arr: ArrayLike<number>): number {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return i;
  }
  return -1;
}

describe('10-Weapon Digital Armory 1:1 plugin, geometry, kinematics & PBR contracts', () => {
  it('registers all 10 iconic firearms totaling 253 parts with accurate category filtering & camera presets', () => {
    expect(WEAPON_MANIFESTS).toHaveLength(10);
    expect(ARMORY_WEAPONS).toHaveLength(10);

    const totalCatalogParts = WEAPON_MANIFESTS.reduce(
      (sum, m) => sum + m.catalog.partsCount,
      0
    );
    expect(totalCatalogParts).toBe(253);

    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'all'))
    ).toHaveLength(10);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'assault'))
    ).toHaveLength(4);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'smg'))
    ).toHaveLength(1);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'sniper'))
    ).toHaveLength(2);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'pistol'))
    ).toHaveLength(3);

    for (const manifest of WEAPON_MANIFESTS) {
      expect(manifest.atlasHeadingCn).toContain('Packed ORM');

      // 1:1 Factory Metrology & Internal Ballistics (`specs1To1`)
      const specs = manifest.catalog.specs1To1;
      expect(specs, `${manifest.id}: missing specs1To1`).toBeDefined();
      expect(specs.overallLengthMm.trim().length).toBeGreaterThan(0);
      expect(specs.overallLengthMm).toContain('mm');
      expect(specs.barrelSpec.trim().length).toBeGreaterThan(0);
      expect(specs.barrelSpec).toContain('mm');
      expect(specs.emptyWeightKg.trim().length).toBeGreaterThan(0);
      expect(specs.emptyWeightKg).toContain('kg');
      expect(specs.muzzleVelocityMs.trim().length).toBeGreaterThan(0);
      expect(specs.muzzleVelocityMs).toContain('m/s');
      expect(specs.effectiveRangeM.trim().length).toBeGreaterThan(0);
      expect(specs.effectiveRangeM).toContain('m');
      expect(specs.rateOfFire.trim().length).toBeGreaterThan(0);

      for (const v of manifest.workbenchMeta.muzzlePos) {
        expect(Number.isFinite(v)).toBe(true);
      }
      for (const v of manifest.workbenchMeta.chamberGlowPos) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(Number.isFinite(manifest.workbenchMeta.gridY)).toBe(true);

      for (const presetKey of CAMERA_PRESET_KEYS) {
        const preset = manifest.cameraPresets[presetKey];
        expect(preset).toBeDefined();
        for (const v of preset.pos) expect(Number.isFinite(v)).toBe(true);
        for (const v of preset.target) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('enforces 1:1 BOM metadata, disassembly keyframes, dense [0..1] kinematic sweeps, and mechanism-specific motion laws across all 10 plugins', async () => {
    const globalPartIds = new Set<string>();
    let totalRuntimeParts = 0;
    const poseScratch = createMutablePose();

    const loadedPlugins = new Map<
      WeaponId,
      Awaited<ReturnType<typeof loadWeaponPlugin>>
    >();

    for (const manifest of WEAPON_MANIFESTS) {
      const plugin = await loadWeaponPlugin(manifest.id);
      loadedPlugins.set(manifest.id, plugin);

      expect(plugin.id).toBe(manifest.id);
      expect(plugin.parts).toHaveLength(manifest.catalog.partsCount);
      expect(plugin.partGroups).toHaveLength(manifest.catalog.assembliesCount);
      expect(plugin.firingPhases).toHaveLength(
        manifest.catalog.firingStagesCount
      );

      totalRuntimeParts += plugin.parts.length;

      const cutawayPartId = manifest.workbenchMeta.cutawayFocusPartId;
      expect(plugin.parts.some((p) => p.id === cutawayPartId)).toBe(true);

      const groupKeys = new Set(plugin.partGroups.map((g) => g.key));
      const bomCodes = new Set<string>();

      for (const part of plugin.parts) {
        expect(
          globalPartIds.has(part.id),
          `duplicate global part id: ${part.id}`
        ).toBe(false);
        globalPartIds.add(part.id);

        expect(
          bomCodes.has(part.bomCode),
          `duplicate BOM code ${part.bomCode} in ${manifest.id}`
        ).toBe(false);
        bomCodes.add(part.bomCode);

        expect(groupKeys.has(part.group)).toBe(true);

        for (const v of part.assembledPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        if (part.assembledRot) {
          for (const r of part.assembledRot) {
            expect(Number.isFinite(r)).toBe(true);
          }
        }
        if (part.calloutAnchor) {
          for (const a of part.calloutAnchor) {
            expect(Number.isFinite(a)).toBe(true);
          }
        }

        for (const step of part.explodeSteps) {
          const [start, end] = step.range;
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(1);
          expect(start).toBeLessThan(end);
          for (const v of step.offset) {
            expect(Number.isFinite(v)).toBe(true);
          }
          if (step.rotation) {
            for (const r of step.rotation) {
              expect(Number.isFinite(r)).toBe(true);
            }
          }
        }
      }

      // Firing phases span [0, 1]
      expect(plugin.firingPhases[0].range[0]).toBeCloseTo(0, 5);
      expect(
        plugin.firingPhases[plugin.firingPhases.length - 1].range[1]
      ).toBeCloseTo(1, 5);
      for (const phase of plugin.firingPhases) {
        expect(phase.range[0]).toBeLessThan(phase.range[1]);
      }

      // Dense kinematic & ballistics sweep: f = 0.00, 0.02, ..., 1.00
      for (const f of DENSE_FIRING_SWEEP) {
        const phase = plugin.getActiveFiringPhase(f);
        expect(phase.id.length).toBeGreaterThan(0);

        for (const part of plugin.parts) {
          const delta = plugin.computeFiringKinematics(part.id, f);
          expect(
            Number.isFinite(delta.pos[0]) &&
              Number.isFinite(delta.pos[1]) &&
              Number.isFinite(delta.pos[2]),
            `${manifest.id}/${part.id} non-finite pos at f=${f}`
          ).toBe(true);
          expect(
            Number.isFinite(delta.rot[0]) &&
              Number.isFinite(delta.rot[1]) &&
              Number.isFinite(delta.rot[2]),
            `${manifest.id}/${part.id} non-finite rot at f=${f}`
          ).toBe(true);
          expect(
            Number.isFinite(delta.scaleX),
            `${manifest.id}/${part.id} non-finite scaleX at f=${f}`
          ).toBe(true);
          // Note: delta.scaleX represents (1 + dScaleX) in PartKinematicDelta
          const dScaleX = delta.scaleX - 1;
          expect(
            1 + dScaleX,
            `${manifest.id}/${part.id} non-positive recoil spring scale at f=${f}`
          ).toBeGreaterThan(0.05);

          evaluatePartPoseInto(
            part,
            0,
            true,
            f,
            plugin.computeFiringKinematics,
            poseScratch
          );
          expect(
            Number.isFinite(poseScratch.px) &&
              Number.isFinite(poseScratch.py) &&
              Number.isFinite(poseScratch.pz) &&
              Number.isFinite(poseScratch.rx) &&
              Number.isFinite(poseScratch.ry) &&
              Number.isFinite(poseScratch.rz) &&
              poseScratch.sx > 0.05,
            `${manifest.id}/${part.id} invalid evaluated pose at f=${f}`
          ).toBe(true);
        }

        const ballistics = plugin.computeBallisticsState(f);
        for (const v of ballistics.bulletPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        for (const v of ballistics.spentCasePos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        for (const r of ballistics.spentCaseRot) {
          expect(Number.isFinite(r)).toBe(true);
        }
        for (const v of ballistics.nextRoundPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        for (const v of ballistics.reserveRoundPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        for (const v of ballistics.gasPortPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(Number.isFinite(ballistics.streakLength)).toBe(true);
        expect(Number.isFinite(ballistics.spentCaseOpacity)).toBe(true);
        expect(Number.isFinite(ballistics.nextRoundRotZ)).toBe(true);
        expect(Number.isFinite(ballistics.chamberFlashIntensity)).toBe(true);
        expect(Number.isFinite(ballistics.muzzlePlumeScale)).toBe(true);
        expect(Number.isFinite(ballistics.muzzlePlumeOpacity)).toBe(true);
        expect(Number.isFinite(ballistics.gasPortFlashIntensity)).toBe(true);
      }

      // Dynamic spring deformation check per weapon
      for (const springId of DYNAMIC_SPRING_PARTS[manifest.id]) {
        let minScale = Infinity;
        let maxScale = -Infinity;
        for (const f of DENSE_FIRING_SWEEP) {
          const sx = plugin.computeFiringKinematics(springId, f).scaleX;
          if (sx < minScale) minScale = sx;
          if (sx > maxScale) maxScale = sx;
        }
        expect(
          minScale,
          `${manifest.id}/${springId} min scaleX must stay > 0.05`
        ).toBeGreaterThan(0.05);
        expect(
          maxScale - minScale,
          `${manifest.id}/${springId} must dynamically compress/extend during firing`
        ).toBeGreaterThan(0.08);
      }
    }

    expect(totalRuntimeParts).toBe(253);
    expect(globalPartIds.size).toBe(253);

    // 1. M82A1 short-recoil barrel + accelerator motion law
    const m82Plugin = loadedPlugins.get('m82a1')!;
    let minM82BarrelDx = 0;
    let minM82BrakeDx = 0;
    let minM82CarrierDx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      minM82BarrelDx = Math.min(
        minM82BarrelDx,
        m82Plugin.computeFiringKinematics('m82a1_barrel', f).pos[0]
      );
      minM82BrakeDx = Math.min(
        minM82BrakeDx,
        m82Plugin.computeFiringKinematics('m82a1_muzzle_brake', f).pos[0]
      );
      minM82CarrierDx = Math.min(
        minM82CarrierDx,
        m82Plugin.computeFiringKinematics('m82a1_bolt_carrier', f).pos[0]
      );
    }
    expect(minM82BarrelDx).toBeLessThan(-1.2);
    expect(minM82BrakeDx).toBeCloseTo(minM82BarrelDx, 4);
    expect(minM82CarrierDx).toBeLessThan(minM82BarrelDx - 3.0);

    // 2. G17 & P320 Browning short-recoil tilt-barrel pitch & cam drop
    for (const [wid, barrelId] of [
      ['g17', 'barrel'],
      ['p320', 'p320_barrel'],
    ] as const) {
      const plugin = loadedPlugins.get(wid)!;
      let minDx = 0;
      let minDy = 0;
      let maxAbsPitchRz = 0;
      for (const f of DENSE_FIRING_SWEEP) {
        const d = plugin.computeFiringKinematics(barrelId, f);
        minDx = Math.min(minDx, d.pos[0]);
        minDy = Math.min(minDy, d.pos[1]);
        maxAbsPitchRz = Math.max(maxAbsPitchRz, Math.abs(d.rot[2]));
      }
      expect(
        minDx,
        `${wid}/${barrelId} must cam rearward during short-recoil unlock`
      ).toBeLessThan(-0.1);
      expect(
        minDy,
        `${wid}/${barrelId} must drop downward off slide locking hood`
      ).toBeLessThan(-0.05);
      expect(
        maxAbsPitchRz,
        `${wid}/${barrelId} must exhibit tilt-barrel pitch (rz)`
      ).toBeGreaterThan(0.02);
    }

    // Fixed-barrel firearms must hold their barrels stationary during firing
    for (const { weaponId, partId } of FIXED_BARREL_PARTS) {
      const plugin = loadedPlugins.get(weaponId)!;
      for (const f of DENSE_FIRING_SWEEP) {
        const d = plugin.computeFiringKinematics(partId, f);
        expect(
          Math.abs(d.pos[0]) + Math.abs(d.pos[1]) + Math.abs(d.rot[2]),
          `${weaponId}/${partId} fixed barrel should not translate or tilt at f=${f}`
        ).toBeLessThan(1e-4);
      }
    }

    // 3. Rotating-bolt coaxial lug roll (rx) across AK15, M4A1, SCAR, AUG, Deagle, AWM & M82A1
    for (const { weaponId, partId, minAbsRollRad } of ROTATING_BOLT_PARTS) {
      const plugin = loadedPlugins.get(weaponId)!;
      let maxAbsRx = 0;
      let minBoltDx = 0;
      for (const f of DENSE_FIRING_SWEEP) {
        const d = plugin.computeFiringKinematics(partId, f);
        maxAbsRx = Math.max(maxAbsRx, Math.abs(d.rot[0]));
        minBoltDx = Math.min(minBoltDx, d.pos[0]);
      }
      expect(
        maxAbsRx,
        `${weaponId}/${partId} must exhibit coaxial rotating-bolt roll (rx)`
      ).toBeGreaterThan(minAbsRollRad);
      expect(
        minBoltDx,
        `${weaponId}/${partId} must cycle rearward along -X`
      ).toBeLessThan(-2.0);
    }

    // MP5 roller-delayed blowback: lateral roller retraction (dz) + non-rotating bolt head
    const mp5Plugin = loadedPlugins.get('mp5')!;
    let maxRollerAbsDz = 0;
    let maxMp5BoltAbsRx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const rDelta = mp5Plugin.computeFiringKinematics(
        'mp5_locking_rollers',
        f
      );
      const bDelta = mp5Plugin.computeFiringKinematics('mp5_bolt_head', f);
      maxRollerAbsDz = Math.max(maxRollerAbsDz, Math.abs(rDelta.pos[2]));
      maxMp5BoltAbsRx = Math.max(maxMp5BoltAbsRx, Math.abs(bDelta.rot[0]));
    }
    expect(maxRollerAbsDz).toBeGreaterThan(0.05);
    expect(maxMp5BoltAbsRx).toBeLessThan(1e-4);

    // 4. Endpoint continuity across f = 0.995 -> 1.0 (catches modulo wrap-around snaps on single-shot completion)
    for (const [wid, plugin] of loadedPlugins.entries()) {
      for (const part of plugin.parts) {
        const dNearEnd = plugin.computeFiringKinematics(part.id, 0.995);
        const dEnd = plugin.computeFiringKinematics(part.id, 1.0);
        const endpointJump = Math.hypot(
          dEnd.pos[0] - dNearEnd.pos[0],
          dEnd.pos[1] - dNearEnd.pos[1],
          dEnd.pos[2] - dNearEnd.pos[2],
          dEnd.rot[0] - dNearEnd.rot[0],
          dEnd.rot[1] - dNearEnd.rot[1],
          dEnd.rot[2] - dNearEnd.rot[2],
          dEnd.scaleX - dNearEnd.scaleX
        );
        expect(
          endpointJump,
          `${wid}/${part.id} snapped discontinuously between f=0.995 and f=1.0`
        ).toBeLessThan(0.15);
      }

      const bNearEnd = plugin.computeBallisticsState(0.995);
      const bEnd = plugin.computeBallisticsState(1.0);
      expect(
        bEnd.spentCaseVisible,
        `${wid}: spentCaseVisible wrapped back to true at f=1.0`
      ).toBe(bNearEnd.spentCaseVisible);
      expect(
        bEnd.bulletVisible,
        `${wid}: bulletVisible wrapped back to true at f=1.0`
      ).toBe(bNearEnd.bulletVisible);
      const nextRoundJump = Math.hypot(
        bEnd.nextRoundPos[0] - bNearEnd.nextRoundPos[0],
        bEnd.nextRoundPos[1] - bNearEnd.nextRoundPos[1],
        bEnd.nextRoundPos[2] - bNearEnd.nextRoundPos[2]
      );
      expect(
        nextRoundJump,
        `${wid}: nextRoundPos snapped between f=0.995 and f=1.0`
      ).toBeLessThan(0.25);
    }
  });

  it('builds all 253 CSG/parametric BufferGeometries with finite attributes, unit normals, positive 3D volume, and [0, 1] custom-atlas UVs', async () => {
    let builtPartsCount = 0;

    for (const manifest of WEAPON_MANIFESTS) {
      const plugin = await loadWeaponPlugin(manifest.id);
      const builders = await loadWeaponGeometryBuilders(manifest.id);

      for (const part of plugin.parts) {
        const label = `${manifest.id}/${part.id}`;
        expect(
          typeof builders[part.id],
          `missing geometry builder for ${label}`
        ).toBe('function');

        const geo = builders[part.id]();
        builtPartsCount++;

        try {
          const pos = geo.getAttribute('position');
          const norm = geo.getAttribute('normal');
          const uv = geo.getAttribute('uv');
          const col = geo.getAttribute('color');

          expect(pos, `${label}: missing position attribute`).toBeDefined();
          expect(norm, `${label}: missing normal attribute`).toBeDefined();
          expect(uv, `${label}: missing uv attribute`).toBeDefined();
          expect(col, `${label}: missing color attribute`).toBeDefined();

          expect(
            pos.count,
            `${label}: position.count must be >= 12`
          ).toBeGreaterThanOrEqual(12);
          expect(pos.itemSize, `${label}: position.itemSize`).toBe(3);
          expect(norm.itemSize, `${label}: normal.itemSize`).toBe(3);
          expect(uv.itemSize, `${label}: uv.itemSize`).toBe(2);
          expect(col.itemSize, `${label}: color.itemSize`).toBe(3);

          expect(norm.count, `${label}: normal.count mismatch`).toBe(pos.count);
          expect(uv.count, `${label}: uv.count mismatch`).toBe(pos.count);
          expect(col.count, `${label}: color.count mismatch`).toBe(pos.count);

          expect(
            findFirstNonFiniteIndex(pos.array),
            `${label}: NaN/Infinity in position`
          ).toBe(-1);
          expect(
            findFirstNonFiniteIndex(norm.array),
            `${label}: NaN/Infinity in normal`
          ).toBe(-1);
          expect(
            findFirstNonFiniteIndex(uv.array),
            `${label}: NaN/Infinity in uv`
          ).toBe(-1);
          expect(
            findFirstNonFiniteIndex(col.array),
            `${label}: NaN/Infinity in color`
          ).toBe(-1);

          // Unit-length normals check (every non-zero normal must be unit length;
          // zero-length normals are only permitted on degenerate zero-area CSG seam slivers)
          const pArr = pos.array;
          const nArr = norm.array;
          const isNonIndexedTriSoup =
            geo.getIndex() === null && pos.count % 3 === 0;
          let badNormalVertex = -1;
          let badNormalReason = '';
          let unitNormalCount = 0;

          for (let v = 0; v < norm.count; v++) {
            const nx = nArr[v * 3];
            const ny = nArr[v * 3 + 1];
            const nz = nArr[v * 3 + 2];
            const len = Math.hypot(nx, ny, nz);

            if (len <= 1e-5) {
              if (isNonIndexedTriSoup) {
                const i0 = Math.floor(v / 3) * 3;
                const i1 = i0 + 1;
                const i2 = i0 + 2;
                const ax = pArr[i1 * 3] - pArr[i0 * 3];
                const ay = pArr[i1 * 3 + 1] - pArr[i0 * 3 + 1];
                const az = pArr[i1 * 3 + 2] - pArr[i0 * 3 + 2];
                const bx = pArr[i2 * 3] - pArr[i0 * 3];
                const by = pArr[i2 * 3 + 1] - pArr[i0 * 3 + 1];
                const bz = pArr[i2 * 3 + 2] - pArr[i0 * 3 + 2];
                const doubleArea = Math.hypot(
                  ay * bz - az * by,
                  az * bx - ax * bz,
                  ax * by - ay * bx
                );
                if (doubleArea > 1e-5) {
                  badNormalVertex = v;
                  badNormalReason = `zero normal on non-degenerate triangle (doubleArea=${doubleArea.toExponential(2)})`;
                  break;
                }
              }
            } else if (Math.abs(len - 1) > 0.025) {
              badNormalVertex = v;
              badNormalReason = `non-unit normal (len=${len.toFixed(4)})`;
              break;
            } else {
              unitNormalCount++;
            }
          }
          expect(
            badNormalVertex,
            `${label}: invalid normal at vertex ${badNormalVertex} (${badNormalReason})`
          ).toBe(-1);
          expect(
            unitNormalCount,
            `${label}: fewer than 12 unit-normal vertices`
          ).toBeGreaterThanOrEqual(12);
          expect(
            unitNormalCount / norm.count,
            `${label}: excessive degenerate pole/sliver triangles`
          ).toBeGreaterThanOrEqual(0.85);

          // Non-zero 3D bounding box extent & volume
          geo.computeBoundingBox();
          const box = geo.boundingBox;
          expect(box, `${label}: boundingBox is null`).not.toBeNull();
          const extX = box!.max.x - box!.min.x;
          const extY = box!.max.y - box!.min.y;
          const extZ = box!.max.z - box!.min.z;
          const volume = extX * extY * extZ;
          expect(extX, `${label}: zero X extent`).toBeGreaterThan(1e-3);
          expect(extY, `${label}: zero Y extent`).toBeGreaterThan(1e-3);
          expect(extZ, `${label}: zero Z extent`).toBeGreaterThan(1e-3);
          expect(volume, `${label}: zero 3D volume`).toBeGreaterThan(1e-7);

          // Khronos PBR anti-black-crush vertex-color floor across all 253 parts
          const cArr = col.array;
          let sumLinearLuma = 0;
          for (let v = 0; v < col.count; v++) {
            sumLinearLuma +=
              0.2126 * cArr[v * 3] +
              0.7152 * cArr[v * 3 + 1] +
              0.0722 * cArr[v * 3 + 2];
          }
          const meanLinearLuma = sumLinearLuma / col.count;
          expect(
            meanLinearLuma,
            `${label}: crushed near-black vertex color (meanLinearLuma=${meanLinearLuma.toFixed(4)})`
          ).toBeGreaterThanOrEqual(0.018);
          expect(
            meanLinearLuma,
            `${label}: over-saturated white vertex color (meanLinearLuma=${meanLinearLuma.toFixed(4)})`
          ).toBeLessThanOrEqual(0.98);

          // Custom-atlas UV [0, 1] & non-collapsed island span invariant
          // (catches post-unwrap finalizeGeometry/CSG overwrite or vertex-color classifier collapse)
          const customBinding = plugin.pbrBindings[part.id];
          if (customBinding && (customBinding.repeat ?? 1) <= 1) {
            const uvArr = uv.array;
            let outOfBoundsVertex = -1;
            let badU = 0;
            let badV = 0;
            let minU = Infinity;
            let maxU = -Infinity;
            let minV = Infinity;
            let maxV = -Infinity;
            for (let v = 0; v < uv.count; v++) {
              const uVal = uvArr[v * 2];
              const vVal = uvArr[v * 2 + 1];
              if (uVal < minU) minU = uVal;
              if (uVal > maxU) maxU = uVal;
              if (vVal < minV) minV = vVal;
              if (vVal > maxV) maxV = vVal;
              if (
                uVal < -1e-4 ||
                uVal > 1 + 1e-4 ||
                vVal < -1e-4 ||
                vVal > 1 + 1e-4
              ) {
                outOfBoundsVertex = v;
                badU = uVal;
                badV = vVal;
                break;
              }
            }
            expect(
              outOfBoundsVertex,
              `${label}: custom-atlas UV out of [0, 1] bounds at vertex ${outOfBoundsVertex} (u=${badU.toFixed(4)}, v=${badV.toFixed(4)})`
            ).toBe(-1);
            expect(
              maxU - minU,
              `${label}: collapsed custom-atlas U span`
            ).toBeGreaterThanOrEqual(0.18);
            expect(
              maxV - minV,
              `${label}: collapsed custom-atlas V span`
            ).toBeGreaterThanOrEqual(0.09);
          }
        } finally {
          geo.dispose();
        }
      }
    }

    expect(builtPartsCount).toBe(253);
  }, 120000);

  it('verifies all 58 WebP PBR textures exist on disk (0 PNGs) and all 20 *_roughness.webp ORM maps have valid RGB WebP headers', async () => {
    expect(fs.existsSync(TEXTURES_DIR)).toBe(true);
    const diskFiles = fs.readdirSync(TEXTURES_DIR);
    const webpFiles = diskFiles.filter((f) => f.endsWith('.webp')).sort();
    const pngFiles = diskFiles.filter((f) => f.endsWith('.png'));
    const roughnessFiles = webpFiles.filter((f) =>
      f.endsWith('_roughness.webp')
    );
    const normalFiles = webpFiles.filter((f) => f.endsWith('_normal.webp'));

    expect(webpFiles).toHaveLength(58);
    expect(pngFiles).toHaveLength(0);
    expect(roughnessFiles).toHaveLength(20);
    expect(normalFiles).toHaveLength(20);

    // Binary RIFF/WEBP header validation across all 58 textures
    for (const fileName of webpFiles) {
      const fullPath = path.join(TEXTURES_DIR, fileName);
      const buf = fs.readFileSync(fullPath);
      const header = parseWebpHeader(buf, fileName);
      expect(header.width, `${fileName}: invalid width`).toBeGreaterThanOrEqual(
        512
      );
      expect(
        header.height,
        `${fileName}: invalid height`
      ).toBeGreaterThanOrEqual(512);
    }

    // All 20 *_roughness.webp Packed ORM maps & 20 *_normal.webp maps must have 3-channel RGB WebP headers (no alpha)
    for (const linearRgbFile of [...roughnessFiles, ...normalFiles]) {
      const fullPath = path.join(TEXTURES_DIR, linearRgbFile);
      const buf = fs.readFileSync(fullPath);
      const header = parseWebpHeader(buf, linearRgbFile);
      expect(
        header.hasAlpha,
        `${linearRgbFile}: linear PBR map must be 3-channel RGB without alpha`
      ).toBe(false);
    }

    const diskSet = new Set(webpFiles);
    for (const shared of [
      'metal_detail_normal.webp',
      'metal_detail_roughness.webp',
      'polymer_detail_normal.webp',
      'polymer_detail_roughness.webp',
    ]) {
      expect(diskSet.has(shared)).toBe(true);
    }

    for (const manifest of WEAPON_MANIFESTS) {
      const plugin = await loadWeaponPlugin(manifest.id);

      for (const [partId, binding] of Object.entries(plugin.pbrBindings)) {
        expect(plugin.parts.some((p) => p.id === partId)).toBe(true);
        expect(
          diskSet.has(normalizeTextureFileName(binding.albedoFile))
        ).toBe(true);
        expect(
          diskSet.has(normalizeTextureFileName(binding.normalFile))
        ).toBe(true);
        expect(
          diskSet.has(normalizeTextureFileName(binding.roughnessFile))
        ).toBe(true);
      }

      expect(plugin.pbrSuites.length).toBeGreaterThan(0);
      for (const suite of plugin.pbrSuites) {
        for (const ch of suite.channels) {
          expect(diskSet.has(normalizeTextureFileName(ch.fileName))).toBe(true);
        }
      }
    }
  });

  it('enforces Armorer longitudinal sectionCut state, toggle/set actions, resetAll cleanup, and mutual cleanliness with xrayShells', () => {
    const store = useAppStore;
    store.getState().returnToArmory();

    // 1. Default state
    expect(store.getState().sectionCut).toBe(false);
    expect(store.getState().xrayShells).toBe(false);

    // 2. toggleSectionCut & mutual cleanliness with xrayShells
    store.getState().setXrayShells(true);
    expect(store.getState().xrayShells).toBe(true);
    expect(store.getState().sectionCut).toBe(false);

    store.getState().toggleSectionCut();
    expect(store.getState().sectionCut).toBe(true);
    expect(store.getState().xrayShells).toBe(false);

    store.getState().toggleXrayShells();
    expect(store.getState().xrayShells).toBe(true);
    expect(store.getState().sectionCut).toBe(false);

    // 3. setSectionCut(true/false) & firing mode preservation
    store.getState().setSectionCut(true);
    expect(store.getState().sectionCut).toBe(true);
    expect(store.getState().xrayShells).toBe(false);

    store.getState().setMode('firing');
    expect(store.getState().sectionCut).toBe(true);
    expect(store.getState().xrayShells).toBe(false);

    store.getState().setSectionCut(false);
    expect(store.getState().sectionCut).toBe(false);

    // 4. resetAll & navigation resets sectionCut cleanly
    store.getState().setSectionCut(true);
    store.getState().resetAll();
    expect(store.getState().sectionCut).toBe(false);
    expect(store.getState().xrayShells).toBe(false);

    store.getState().setSectionCut(true);
    store.getState().enterWorkbench('m82a1', 'explode');
    expect(store.getState().sectionCut).toBe(false);

    store.getState().setSectionCut(true);
    store.getState().returnToArmory();
    expect(store.getState().sectionCut).toBe(false);

    // 5. Promotional Showcase screen transitions cleanly to/from Armory & Workbench
    store.getState().openShowcase();
    expect(store.getState().screen).toBe('showcase');
    expect(store.getState().sectionCut).toBe(false);
    expect(store.getState().xrayShells).toBe(false);

    store.getState().returnToArmory();
    expect(store.getState().screen).toBe('armory');
  });
});

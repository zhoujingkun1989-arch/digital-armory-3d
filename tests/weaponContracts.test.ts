import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  computePartTransform,
  createMutablePose,
  evaluatePartPoseInto,
} from '../src/engine/kinematics/math';
import { normalizeTextureFileName } from '../src/engine/utils/assetUrl';
import {
  resolvePartCalloutLabel,
  resolveWeaponDisplayMeta,
  WEAPON_EN_FALLBACKS,
} from '../src/i18n/weaponFallbacks';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponGeometryBuilders } from '../src/weapons/geometryLoaders';
import {
  ARMORY_WEAPONS,
  matchesArmoryCategory,
  WEAPON_MANIFESTS,
} from '../src/weapons/manifests';
import {
  P08_TOGGLE_LINK_LEN,
  P08_TOGGLE_OVERCENTER_RAD,
} from '../src/weapons/p08/meshes/p08Geometries';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { CameraPresetType, WeaponId } from '../src/weapons/types';

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const TEXTURES_DIR = path.join(ROOT_DIR, 'public', 'textures');
const AUDIO_DIR = path.join(ROOT_DIR, 'public', 'audio');
const TTS_CACHE_DIR = path.join(ROOT_DIR, 'scripts', 'narrations', '.cache');
const CJK_OR_FULLWIDTH_RE =
  /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;
const EXPECTED_TTS_MODEL = 'gemini-3.8-flash-tts';
const EXPECTED_TTS_VOICE = 'Charon';
const EXPECTED_TTS_STYLE: Readonly<Record<'zh' | 'en', string>> = {
  zh: '沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，语速适中自然，重点转折处略作停顿，吐字清晰饱满',
  en: 'Authoritative, warm, articulate museum firearm historian and mechanical engineering documentary narrator, measured pace with natural cadence',
};

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
  p90: ['p90_recoil_springs'],
  lift33: [
    'lift33_bowstring',
    'lift33_yoke_cables',
    'lift33_upper_limbs',
    'lift33_lower_limbs',
  ],
  r500: [
    'r500_trigger_spring',
    'r500_bowstring',
    'r500_power_cables',
    'r500_left_limbs',
    'r500_right_limbs',
  ],
  python: ['python_mainspring', 'python_extractor_spring'],
  benellim4: [
    'benellim4_recoil_spring',
    'benellim4_hammer_spring',
    'benellim4_mag_spring',
  ],
  garand: ['garand_op_rod_spring', 'garand_hammer_spring'],
  m249: ['m249_recoil_spring', 'm249_sear_spring'],
  p08: ['p08_recoil_spring', 'p08_striker_spring', 'p08_mag_spring'],
  vector: ['vector_recoil_spring', 'vector_hammer_spring', 'vector_mag_spring'],
  g11: ['g11_recoil_spring', 'g11_mag_spring'],
  vss: ['vss_recoil_spring', 'vss_striker_spring'],
  m134: ['m134_clutch_spring', 'm134_feeder_spring'],
  an94: ['an94_recoil_spring', 'an94_receiver_buffer_spring'],
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
  { weaponId: 'benellim4', partId: 'benellim4_bolt_head', minAbsRollRad: 0.55 },
  { weaponId: 'garand', partId: 'garand_bolt', minAbsRollRad: 0.45 },
  { weaponId: 'm249', partId: 'm249_bolt', minAbsRollRad: 0.45 },
  { weaponId: 'vss', partId: 'vss_bolt', minAbsRollRad: 0.5 },
  { weaponId: 'an94', partId: 'an94_bolt', minAbsRollRad: 0.5 },
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
  { weaponId: 'p90', partId: 'p90_barrel' },
  { weaponId: 'python', partId: 'python_barrel' },
  { weaponId: 'benellim4', partId: 'benellim4_barrel' },
  { weaponId: 'garand', partId: 'garand_barrel' },
  { weaponId: 'm249', partId: 'm249_barrel' },
  { weaponId: 'vector', partId: 'vector_barrel' },
  { weaponId: 'vss', partId: 'vss_barrel' },
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
    throw new Error(`${fileName}: invalid RIFF/WEBP magic (${riff}/${webp})`);
  }
  if (riffSize + 8 > buf.length) {
    throw new Error(
      `${fileName}: truncated RIFF payload (${riffSize + 8} > ${buf.length})`
    );
  }

  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    const isInterFrame = (buf[20] & 0x01) !== 0;
    const syncOk = buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a;
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

describe('23-Exhibit Digital Armory WP-17 1:1 plugin, geometry, kinematics & PBR contracts', () => {
  it('registers all 23 iconic exhibits totaling 579 parts across all 8 categories with accurate camera presets', () => {
    expect(WEAPON_MANIFESTS).toHaveLength(23);
    expect(ARMORY_WEAPONS).toHaveLength(23);

    const totalCatalogParts = WEAPON_MANIFESTS.reduce(
      (sum, m) => sum + m.catalog.partsCount,
      0
    );
    expect(totalCatalogParts).toBe(579);

    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'all'))
    ).toHaveLength(23);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'assault'))
    ).toHaveLength(7);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'lmg'))
    ).toHaveLength(2);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'smg'))
    ).toHaveLength(3);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'sniper'))
    ).toHaveLength(3);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'shotgun'))
    ).toHaveLength(1);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'pistol'))
    ).toHaveLength(5);
    expect(
      ARMORY_WEAPONS.filter((w) => matchesArmoryCategory(w, 'archery'))
    ).toHaveLength(2);

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

  it('enforces 1:1 BOM metadata, disassembly keyframes, dense [0..1] kinematic sweeps, and mechanism-specific motion laws across all 23 plugins', async () => {
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

    expect(totalRuntimeParts).toBe(579);
    expect(globalPartIds.size).toBe(579);

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

    // FN P90 straight-blowback non-rotating bolt + 90° helical feed-ramp yaw rotation + vertical bottom ejection
    const p90Plugin = loadedPlugins.get('p90')!;
    let maxP90BoltAbsRx = 0;
    let minP90BoltDx = 0;
    let maxP90DustCoverRx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const bDelta = p90Plugin.computeFiringKinematics('p90_bolt', f);
      const covDelta = p90Plugin.computeFiringKinematics(
        'p90_ejection_cover',
        f
      );
      maxP90BoltAbsRx = Math.max(maxP90BoltAbsRx, Math.abs(bDelta.rot[0]));
      minP90BoltDx = Math.min(minP90BoltDx, bDelta.pos[0]);
      maxP90DustCoverRx = Math.max(maxP90DustCoverRx, covDelta.rot[0]);
    }
    expect(maxP90BoltAbsRx).toBeLessThan(1e-4);
    expect(minP90BoltDx).toBeLessThan(-3.5);
    expect(maxP90DustCoverRx).toBeGreaterThan(0.5);

    const p90BallisticsStart = p90Plugin.computeBallisticsState(0);
    const p90BallisticsMidRamp = p90Plugin.computeBallisticsState(0.6);
    const p90BallisticsChambered = p90Plugin.computeBallisticsState(0.86);
    const p90BallisticsBottomDrop = p90Plugin.computeBallisticsState(0.72);
    expect(p90BallisticsStart.nextRoundRotY).toBeCloseTo(Math.PI * 0.5, 4);
    expect(p90BallisticsMidRamp.nextRoundRotY!).toBeGreaterThan(0.15);
    expect(p90BallisticsMidRamp.nextRoundRotY!).toBeLessThan(
      Math.PI * 0.5 - 0.15
    );
    expect(p90BallisticsChambered.nextRoundRotY).toBeCloseTo(0, 4);
    expect(p90BallisticsBottomDrop.spentCaseVisible).toBe(true);
    expect(p90BallisticsBottomDrop.spentCasePos[1]).toBeLessThan(-6.0);
    expect(Math.abs(p90BallisticsBottomDrop.spentCasePos[2])).toBeLessThan(
      0.35
    );

    // 3b. Compound Archery (lift33 binary cams + r500 HexCoil helical cams): zero brass/flash/plume across all f
    for (const archeryId of ['lift33', 'r500'] as const) {
      const archPlugin = loadedPlugins.get(archeryId)!;
      for (const f of DENSE_FIRING_SWEEP) {
        const b = archPlugin.computeBallisticsState(f);
        expect(b.spentCaseVisible, `${archeryId} f=${f}: zero brass`).toBe(false);
        expect(b.chamberFlashIntensity, `${archeryId} f=${f}: zero flash`).toBe(0);
        expect(b.muzzlePlumeOpacity, `${archeryId} f=${f}: zero plume`).toBe(0);
        expect(b.gasPortFlashIntensity, `${archeryId} f=${f}: zero gas flash`).toBe(0);
      }
    }

    const liftPlugin = loadedPlugins.get('lift33')!;
    expect(Math.abs(liftPlugin.computeFiringKinematics('lift33_upper_cam', 0.28).rot[2])).toBeGreaterThan(1.4);
    expect(liftPlugin.computeFiringKinematics('lift33_launcher_fork', 0.44).rot[2]).toBeLessThan(-0.5);

    const r500Plugin = loadedPlugins.get('r500')!;
    expect(Math.abs(r500Plugin.computeFiringKinematics('r500_left_cam', 0.28).rot[1])).toBeGreaterThan(4.5);
    expect(r500Plugin.computeFiringKinematics('r500_trigger_sled', 0.28).pos[0]).toBeLessThan(-35.0);

    // 3c. Wave-2 Heterogeneous Mechanisms: Colt Python 60° ratchet, Benelli M4 twin ARGO + elevator, M1 Garand op-rod dwell + en-bloc pop
    const pythonPlugin = loadedPlugins.get('python')!;
    let maxPythonCylinderRx = 0;
    let maxPythonStarRx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      maxPythonCylinderRx = Math.max(
        maxPythonCylinderRx,
        pythonPlugin.computeFiringKinematics('python_cylinder', f).rot[0]
      );
      maxPythonStarRx = Math.max(
        maxPythonStarRx,
        pythonPlugin.computeFiringKinematics('python_extractor_star', f).rot[0]
      );
      // Revolver retains fired brass inside the 6-shot cylinder during firing cycle
      expect(pythonPlugin.computeBallisticsState(f).spentCaseVisible).toBe(
        false
      );
    }
    expect(maxPythonCylinderRx).toBeCloseTo(Math.PI / 3, 2);
    expect(maxPythonStarRx).toBeCloseTo(Math.PI / 3, 2);

    const benelliPlugin = loadedPlugins.get('benellim4')!;
    let minArgoDx = 0;
    let maxElevatorRz = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      minArgoDx = Math.min(
        minArgoDx,
        benelliPlugin.computeFiringKinematics('benellim4_argo_pistons', f).pos[0]
      );
      maxElevatorRz = Math.max(
        maxElevatorRz,
        Math.abs(
          benelliPlugin.computeFiringKinematics('benellim4_shell_elevator', f)
            .rot[2]
        )
      );
    }
    expect(minArgoDx).toBeLessThan(-1.2);
    expect(minArgoDx).toBeGreaterThan(-2.0);
    expect(maxElevatorRz).toBeGreaterThan(0.25);

    const garandPlugin = loadedPlugins.get('garand')!;
    // ~4mm free-travel safety dwell: at f = 0.24 op-rod has started rearward while bolt has not translated rearward yet
    const garandOpRodDwell = garandPlugin.computeFiringKinematics(
      'garand_op_rod',
      0.24
    );
    const garandBoltDwell = garandPlugin.computeFiringKinematics(
      'garand_bolt',
      0.24
    );
    expect(garandOpRodDwell.pos[0]).toBeLessThan(-0.15);
    expect(Math.abs(garandBoltDwell.pos[0])).toBeLessThan(0.05);
    let maxEnblocDy = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      maxEnblocDy = Math.max(
        maxEnblocDy,
        garandPlugin.computeFiringKinematics('garand_enbloc_clip', f).pos[1]
      );
    }
    expect(maxEnblocDy).toBeGreaterThan(0.15);

    // 3d. V2.0 BAY-17 ~ BAY-19 Signature Mechanisms:
    //  - M249 SAW: open-bolt forward bolt rush (+9.50 cm), >= 0.45 rad 2-lug lockup, slide-linked firing pin safety, M27 belt shuttle
    const m249Plugin = loadedPlugins.get('m249')!;
    let maxM249BoltDx = -Infinity;
    let minM249BoltDx = Infinity;
    let maxM249BoltRx = 0;
    let minM249PawlDz = Infinity;
    let maxM249PawlDz = -Infinity;
    for (const f of DENSE_FIRING_SWEEP) {
      const boltD = m249Plugin.computeFiringKinematics('m249_bolt', f);
      const pawlD = m249Plugin.computeFiringKinematics('m249_feed_pawls', f);
      maxM249BoltDx = Math.max(maxM249BoltDx, boltD.pos[0]);
      minM249BoltDx = Math.min(minM249BoltDx, boltD.pos[0]);
      maxM249BoltRx = Math.max(maxM249BoltRx, Math.abs(boltD.rot[0]));
      minM249PawlDz = Math.min(minM249PawlDz, pawlD.pos[2]);
      maxM249PawlDz = Math.max(maxM249PawlDz, pawlD.pos[2]);
    }
    expect(maxM249BoltDx).toBeGreaterThan(8.5);
    expect(minM249BoltDx).toBeLessThan(-2.0);
    expect(maxM249BoltRx).toBeGreaterThanOrEqual(0.45);
    expect(maxM249PawlDz - minM249PawlDz).toBeGreaterThan(1.0);
    // Slide-linked firing pin remains retracted behind bolt face during unlocked rush (f=0.14) and protrudes only in locked battery (f=0.24)
    expect(
      m249Plugin.computeFiringKinematics('m249_firing_pin', 0.14).pos[0] -
        m249Plugin.computeFiringKinematics('m249_bolt', 0.14).pos[0]
    ).toBeCloseTo(0, 5);
    expect(
      m249Plugin.computeFiringKinematics('m249_firing_pin', 0.24).pos[0] -
        m249Plugin.computeFiringKinematics('m249_bolt', 0.24).pos[0]
    ).toBeGreaterThan(0.3);
    // Open-bolt empty chamber at rest (f=0 and f=1)
    expect(m249Plugin.computeBallisticsState(0).spentCaseVisible).toBe(false);
    expect(m249Plugin.computeBallisticsState(0).bulletVisible).toBe(false);
    expect(m249Plugin.computeBallisticsState(1).spentCaseVisible).toBe(false);

    //  - Luger P08: short-recoil barrel (-0.65 cm) + 2-bar knee-joint toggle upward buckle (dy > 2.5 cm & |rz| > 0.7 rad) + straight breechblock (< -3.5 cm)
    const p08Plugin = loadedPlugins.get('p08')!;
    const p08FrontToggleSpec = p08Plugin.parts.find(
      (p) => p.id === 'p08_front_toggle'
    )!;
    const p08RearToggleSpec = p08Plugin.parts.find(
      (p) => p.id === 'p08_rear_toggle'
    )!;
    const localRearKnee = new THREE.Vector3(
      P08_TOGGLE_LINK_LEN * Math.cos(-P08_TOGGLE_OVERCENTER_RAD),
      P08_TOGGLE_LINK_LEN * Math.sin(-P08_TOGGLE_OVERCENTER_RAD),
      0
    );
    const localFrontKnee = new THREE.Vector3(
      -P08_TOGGLE_LINK_LEN * Math.cos(-P08_TOGGLE_OVERCENTER_RAD),
      P08_TOGGLE_LINK_LEN * Math.sin(-P08_TOGGLE_OVERCENTER_RAD),
      0
    );
    const evalKneeWorld = (
      partSpec: typeof p08FrontToggleSpec,
      localKnee: THREE.Vector3,
      f: number
    ) => {
      evaluatePartPoseInto(
        partSpec,
        0,
        true,
        f,
        p08Plugin.computeFiringKinematics,
        poseScratch
      );
      return localKnee
        .clone()
        .applyEuler(
          new THREE.Euler(poseScratch.rx, poseScratch.ry, poseScratch.rz)
        )
        .add(new THREE.Vector3(poseScratch.px, poseScratch.py, poseScratch.pz));
    };
    const restRearKnee = evalKneeWorld(p08RearToggleSpec, localRearKnee, 0);
    const restFrontKnee = evalKneeWorld(p08FrontToggleSpec, localFrontKnee, 0);
    expect(restRearKnee.distanceTo(restFrontKnee)).toBeLessThan(1e-4);

    let maxP08FrontToggleAbsRz = 0;
    let maxP08RearToggleAbsRz = 0;
    let maxP08FrontToggleKneeDy = 0;
    let maxP08RearToggleKneeDy = 0;
    let minP08BreechDx = 0;
    let minP08BarrelDx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const ftD = p08Plugin.computeFiringKinematics('p08_front_toggle', f);
      const rtD = p08Plugin.computeFiringKinematics('p08_rear_toggle', f);
      const bbD = p08Plugin.computeFiringKinematics('p08_breechblock', f);
      const bblD = p08Plugin.computeFiringKinematics('p08_barrel', f);

      maxP08FrontToggleAbsRz = Math.max(
        maxP08FrontToggleAbsRz,
        Math.abs(ftD.rot[2])
      );
      maxP08RearToggleAbsRz = Math.max(
        maxP08RearToggleAbsRz,
        Math.abs(rtD.rot[2])
      );
      minP08BreechDx = Math.min(minP08BreechDx, bbD.pos[0]);
      minP08BarrelDx = Math.min(minP08BarrelDx, bblD.pos[0]);
      // Pure horizontal breechblock motion (0 vertical buckle / 0 pitch)
      expect(Math.abs(bbD.pos[1]) + Math.abs(bbD.rot[2])).toBeLessThan(1e-6);

      const rk = evalKneeWorld(p08RearToggleSpec, localRearKnee, f);
      const fk = evalKneeWorld(p08FrontToggleSpec, localFrontKnee, f);
      expect(
        rk.distanceTo(fk),
        `p08 knee-joint hinge pin split apart at f=${f}`
      ).toBeLessThan(1e-4);
      maxP08RearToggleKneeDy = Math.max(
        maxP08RearToggleKneeDy,
        rk.y - restRearKnee.y
      );
      maxP08FrontToggleKneeDy = Math.max(
        maxP08FrontToggleKneeDy,
        fk.y - restFrontKnee.y
      );
    }
    expect(maxP08FrontToggleAbsRz).toBeGreaterThan(0.7);
    expect(maxP08RearToggleAbsRz).toBeGreaterThan(0.7);
    expect(maxP08FrontToggleKneeDy).toBeGreaterThan(2.5);
    expect(maxP08RearToggleKneeDy).toBeGreaterThan(2.5);
    expect(minP08BreechDx).toBeLessThan(-3.5);
    expect(minP08BarrelDx).toBeCloseTo(-0.65, 3);

    //  - KRISS Vector Gen II: Super V -65° off-axis counterweight plunge (slider dy < -5.0 cm while bolt dx < -3.0 cm)
    const vectorPlugin = loadedPlugins.get('vector')!;
    let minVectorSliderDy = 0;
    let minVectorSliderDx = 0;
    let minVectorBoltDx = 0;
    let minVectorBoltDy = 0;
    let maxVectorHammerRz = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const sD = vectorPlugin.computeFiringKinematics('vector_slider', f);
      const bD = vectorPlugin.computeFiringKinematics('vector_bolt', f);
      const hD = vectorPlugin.computeFiringKinematics('vector_hammer', f);
      minVectorSliderDy = Math.min(minVectorSliderDy, sD.pos[1]);
      minVectorSliderDx = Math.min(minVectorSliderDx, sD.pos[0]);
      minVectorBoltDx = Math.min(minVectorBoltDx, bD.pos[0]);
      minVectorBoltDy = Math.min(minVectorBoltDy, bD.pos[1]);
      maxVectorHammerRz = Math.max(maxVectorHammerRz, hD.rot[2]);
    }
    expect(minVectorSliderDy).toBeLessThan(-5.0);
    expect(minVectorSliderDx).toBeLessThan(-2.4);
    expect(minVectorBoltDx).toBeLessThan(-3.0);
    expect(minVectorBoltDy).toBeLessThan(-1.0);
    expect(maxVectorHammerRz).toBeGreaterThan(0.75);

    // 3d. WP-17 Mechanical Marvels (BAY-20..23):
    //  - H&K G11 K2: 90° rotary breech, counter-rotating Swiss clockwork gears, floating action (-4.20 cm),
    //    vertical DM11 loading rammer plunge, and 100% caseless zero-brass ballistics
    const g11Plugin = loadedPlugins.get('g11')!;
    let maxG11BreechAbsRz = 0;
    let maxG11GearAbsRz = 0;
    let minG11InnerDx = 0;
    let minG11BarrelDx = 0;
    let minG11RammerDy = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const br = g11Plugin.computeFiringKinematics('g11_rotary_breech', f);
      const gr = g11Plugin.computeFiringKinematics('g11_clockwork_gears', f);
      const ir = g11Plugin.computeFiringKinematics('g11_inner_receiver', f);
      const bl = g11Plugin.computeFiringKinematics('g11_barrel', f);
      const rm = g11Plugin.computeFiringKinematics('g11_loading_rammer', f);
      maxG11BreechAbsRz = Math.max(maxG11BreechAbsRz, Math.abs(br.rot[2]));
      maxG11GearAbsRz = Math.max(maxG11GearAbsRz, Math.abs(gr.rot[2]));
      minG11InnerDx = Math.min(minG11InnerDx, ir.pos[0]);
      minG11BarrelDx = Math.min(minG11BarrelDx, bl.pos[0]);
      minG11RammerDy = Math.min(minG11RammerDy, rm.pos[1]);
      expect(
        g11Plugin.computeBallisticsState(f).spentCaseVisible,
        `g11 caseless DM11 must never show spent brass at f=${f}`
      ).toBe(false);
    }
    expect(maxG11BreechAbsRz).toBeCloseTo(Math.PI * 0.5, 2);
    expect(maxG11GearAbsRz).toBeGreaterThan(1.5);
    expect(minG11InnerDx).toBeLessThan(-3.5);
    expect(minG11BarrelDx).toBeCloseTo(minG11InnerDx, 2);
    expect(minG11RammerDy).toBeLessThan(-2.0);

    //  - VSS Vintorez: hammerless linear striker slam, long-stroke carrier dwell & stationary integral baffle stack
    const vssPlugin = loadedPlugins.get('vss')!;
    let minVssStrikerDx = Infinity;
    let maxVssStrikerDx = -Infinity;
    let minVssCarrierDx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const st = vssPlugin.computeFiringKinematics('vss_striker', f);
      const bc = vssPlugin.computeFiringKinematics('vss_bolt_carrier', f);
      const bf = vssPlugin.computeFiringKinematics('vss_baffle_stack', f);
      minVssStrikerDx = Math.min(minVssStrikerDx, st.pos[0]);
      maxVssStrikerDx = Math.max(maxVssStrikerDx, st.pos[0]);
      minVssCarrierDx = Math.min(minVssCarrierDx, bc.pos[0]);
      expect(
        Math.abs(bf.pos[0]) + Math.abs(bf.pos[1]) + Math.abs(bf.rot[0])
      ).toBeLessThan(1e-5);
    }
    expect(maxVssStrikerDx - minVssStrikerDx).toBeGreaterThan(1.8);
    expect(minVssCarrierDx).toBeLessThan(-6.5);

    //  - M134D Minigun: continuous 360° coaxial barrel/rotor spin, counter-rotating delinker sprocket,
    //    and 6 orbiting bolts reciprocating sinusoidally (>= 4.0 cm) inside the 360° cam track
    const m134Plugin = loadedPlugins.get('m134')!;
    let maxM134ClusterRx = 0;
    let minM134SprocketRx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const cl = m134Plugin.computeFiringKinematics('m134_barrel_cluster', f);
      const rt = m134Plugin.computeFiringKinematics('m134_rotor_assembly', f);
      const sp = m134Plugin.computeFiringKinematics('m134_delinker_sprocket', f);
      maxM134ClusterRx = Math.max(maxM134ClusterRx, cl.rot[0]);
      expect(rt.rot[0]).toBeCloseTo(cl.rot[0], 3);
      minM134SprocketRx = Math.min(minM134SprocketRx, sp.rot[0]);
    }
    expect(maxM134ClusterRx).toBeGreaterThan(6.0);
    expect(minM134SprocketRx).toBeLessThan(-6.0);
    for (let bi = 1; bi <= 6; bi++) {
      let minBx = Infinity;
      let maxBx = -Infinity;
      for (const f of DENSE_FIRING_SWEEP) {
        const bd = m134Plugin.computeFiringKinematics(`m134_bolt_${bi}`, f);
        minBx = Math.min(minBx, bd.pos[0]);
        maxBx = Math.max(maxBx, bd.pos[0]);
      }
      expect(
        maxBx - minBx,
        `m134_bolt_${bi} cam-track stroke must span >= 4.0 cm`
      ).toBeGreaterThan(4.0);
    }

    //  - AN-94 Abakan: floating barreled action (-4.20 cm) inside stationary outer housing,
    //    V-groove pulley wheel rotation (>= 4.0 rad), and forward-lunging 2-stage feed rammer (>= 2.0 cm)
    const an94Plugin = loadedPlugins.get('an94')!;
    let minAn94BarrelDx = 0;
    let minAn94InnerDx = 0;
    let maxAn94PulleyAbsRz = 0;
    let maxAn94RammerDx = 0;
    for (const f of DENSE_FIRING_SWEEP) {
      const bl = an94Plugin.computeFiringKinematics('an94_barrel', f);
      const ir = an94Plugin.computeFiringKinematics('an94_inner_receiver', f);
      const oh = an94Plugin.computeFiringKinematics('an94_outer_housing', f);
      const pw = an94Plugin.computeFiringKinematics('an94_pulley_wheel', f);
      const fr = an94Plugin.computeFiringKinematics('an94_feed_rammer', f);
      minAn94BarrelDx = Math.min(minAn94BarrelDx, bl.pos[0]);
      minAn94InnerDx = Math.min(minAn94InnerDx, ir.pos[0]);
      maxAn94PulleyAbsRz = Math.max(maxAn94PulleyAbsRz, Math.abs(pw.rot[2]));
      maxAn94RammerDx = Math.max(maxAn94RammerDx, fr.pos[0]);
      expect(Math.abs(oh.pos[0]) + Math.abs(oh.pos[1])).toBeLessThan(1e-5);
    }
    expect(minAn94BarrelDx).toBeLessThan(-3.5);
    expect(minAn94InnerDx).toBeCloseTo(minAn94BarrelDx, 2);
    expect(maxAn94PulleyAbsRz).toBeGreaterThan(4.0);
    expect(maxAn94RammerDx).toBeGreaterThan(2.0);

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

  it('builds all 579 CSG/parametric BufferGeometries with finite attributes, unit normals, positive 3D volume, and [0, 1] custom-atlas UVs', async () => {
    let builtPartsCount = 0;

    for (const manifest of WEAPON_MANIFESTS) {
      const plugin = await loadWeaponPlugin(manifest.id);
      const builders = await loadWeaponGeometryBuilders(manifest.id);
      const explodedWorldBoxes: Array<{ id: string; box: THREE.Box3 }> = [];

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

          // Compute exact world-space AABB at t = 1.0 (100% Full Exploded View)
          const expTf = computePartTransform(part, 1.0);
          const expMat = new THREE.Matrix4().compose(
            new THREE.Vector3(
              expTf.position[0],
              expTf.position[1],
              expTf.position[2]
            ),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                expTf.rotation[0],
                expTf.rotation[1],
                expTf.rotation[2]
              )
            ),
            new THREE.Vector3(1, 1, 1)
          );
          const worldBox = new THREE.Box3();
          const tmpV = new THREE.Vector3();
          for (let v = 0; v < pos.count; v++) {
            tmpV.fromBufferAttribute(pos, v).applyMatrix4(expMat);
            worldBox.expandByPoint(tmpV);
          }
          explodedWorldBoxes.push({ id: part.id, box: worldBox });
        } finally {
          geo.dispose();
        }
      }

      // Verify zero 3D AABB overlaps at t = 1.0 across V2 & WP-17 exhibits (m249, p08, vector, g11, vss, m134, an94)
      if (
        manifest.id === 'm249' ||
        manifest.id === 'p08' ||
        manifest.id === 'vector' ||
        manifest.id === 'g11' ||
        manifest.id === 'vss' ||
        manifest.id === 'm134' ||
        manifest.id === 'an94'
      ) {
        const overlaps: string[] = [];
        for (let i = 0; i < explodedWorldBoxes.length; i++) {
          for (let j = i + 1; j < explodedWorldBoxes.length; j++) {
            const a = explodedWorldBoxes[i];
            const b = explodedWorldBoxes[j];
            if (a.box.intersectsBox(b.box)) {
              const ix =
                Math.min(a.box.max.x, b.box.max.x) -
                Math.max(a.box.min.x, b.box.min.x);
              const iy =
                Math.min(a.box.max.y, b.box.max.y) -
                Math.max(a.box.min.y, b.box.min.y);
              const iz =
                Math.min(a.box.max.z, b.box.max.z) -
                Math.max(a.box.min.z, b.box.min.z);
              overlaps.push(
                `${a.id} <-> ${b.id} (${ix.toFixed(2)}x${iy.toFixed(2)}x${iz.toFixed(2)} cm)`
              );
            }
          }
        }
        expect(
          overlaps,
          `${manifest.id}: 3D AABB overlaps at t=1.0 full explode`
        ).toEqual([]);
      }
    }

    expect(builtPartsCount).toBe(579);
  }, 120000);

  it('verifies all 313 WebP PBR textures exist on disk (0 PNGs) and all 105 *_roughness.webp ORM maps have valid RGB WebP headers', async () => {
    expect(fs.existsSync(TEXTURES_DIR)).toBe(true);
    const diskFiles = fs.readdirSync(TEXTURES_DIR);
    const webpFiles = diskFiles.filter((f) => f.endsWith('.webp')).sort();
    const pngFiles = diskFiles.filter((f) => f.endsWith('.png'));
    const albedoFiles = webpFiles.filter((f) => f.endsWith('_albedo.webp'));
    const roughnessFiles = webpFiles.filter((f) =>
      f.endsWith('_roughness.webp')
    );
    const normalFiles = webpFiles.filter((f) => f.endsWith('_normal.webp'));

    expect(webpFiles).toHaveLength(313);
    expect(pngFiles).toHaveLength(0);
    expect(albedoFiles).toHaveLength(103);
    expect(roughnessFiles).toHaveLength(105);
    expect(normalFiles).toHaveLength(105);

    // Binary RIFF/WEBP header validation across all 277 textures
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

    // All 93 *_roughness.webp Packed ORM maps & 93 *_normal.webp maps must have 3-channel RGB WebP headers (no alpha)
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
        expect(diskSet.has(normalizeTextureFileName(binding.albedoFile))).toBe(
          true
        );
        expect(diskSet.has(normalizeTextureFileName(binding.normalFile))).toBe(
          true
        );
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

    // 6. Entering workbench, switching back to explode mode, and resetAll all default to assembled state (0% 合拢态)
    store.getState().setTargetProgress(0.85);
    expect(playbackClock.getState().targetProgress).toBeCloseTo(0.85, 5);

    store.getState().enterWorkbench('ak15', 'explode');
    expect(playbackClock.getState().targetProgress).toBe(0);

    store.getState().setTargetProgress(1.0);
    store.getState().setMode('firing');
    store.getState().setMode('explode');
    expect(playbackClock.getState().targetProgress).toBe(0);

    store.getState().setTargetProgress(1.0);
    store.getState().resetAll();
    expect(playbackClock.getState().targetProgress).toBe(0);
  });

  it('verifies Google Gemini bilingual R&D stories, all 579 part narrations, all 1,342 MP3 voiceover clips & 23 Charon TTS SHA-256 hash manifests with 0 CJK leaks in English', async () => {
    let totalNarratedParts = 0;
    const allReferencedAudioPaths: string[] = [];

    const assertZeroCjkInEnglish = (val: unknown, ctxPath: string): void => {
      if (typeof val === 'string') {
        expect(
          CJK_OR_FULLWIDTH_RE.test(val),
          `CJK/fullwidth character leak at ${ctxPath}: "${val}"`
        ).toBe(false);
      } else if (Array.isArray(val)) {
        val.forEach((item, idx) =>
          assertZeroCjkInEnglish(item, `${ctxPath}[${idx}]`)
        );
      } else if (val && typeof val === 'object') {
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          assertZeroCjkInEnglish(v, `${ctxPath}.${k}`);
        }
      }
    };

    const sha256Hex = (input: string): string =>
      createHash('sha256').update(input, 'utf8').digest('hex');

    expect(fs.existsSync(TTS_CACHE_DIR)).toBe(true);
    const hashFilesOnDisk = fs
      .readdirSync(TTS_CACHE_DIR)
      .filter((f) => f.endsWith('_tts_hashes.json'))
      .sort();
    expect(hashFilesOnDisk).toHaveLength(23);
    let totalVerifiedHashes = 0;

    for (const manifest of WEAPON_MANIFESTS) {
      const wid = manifest.id;
      const narrationPath = path.join(
        ROOT_DIR,
        'public',
        'narrations',
        `${wid}.json`
      );
      expect(
        fs.existsSync(narrationPath),
        `missing narration bundle for ${wid}`
      ).toBe(true);

      const hashPath = path.join(TTS_CACHE_DIR, `${wid}_tts_hashes.json`);
      expect(
        fs.existsSync(hashPath),
        `missing Charon TTS SHA-256 hash manifest for ${wid}`
      ).toBe(true);
      const ttsHashes = JSON.parse(
        fs.readFileSync(hashPath, 'utf-8')
      ) as Record<string, string>;

      const bundle = JSON.parse(
        fs.readFileSync(narrationPath, 'utf-8')
      ) as WeaponNarrationBundle;
      const plugin = await loadWeaponPlugin(wid);
      const partIds = new Set(plugin.parts.map((p) => p.id));

      expect(bundle.schemaVersion).toBe(1);
      expect(bundle.weaponId).toBe(wid);
      expect(bundle.generatorModels.text).toBe('gemini-3.8-flash');
      expect(bundle.generatorModels.storyTts).toBe(EXPECTED_TTS_MODEL);
      expect(bundle.generatorModels.partTts).toBe(EXPECTED_TTS_MODEL);

      // Strictly 0 CJK/fullwidth characters across all English plugin metadata & English narration fields
      for (const grp of plugin.partGroups) {
        assertZeroCjkInEnglish(grp.nameEn, `${wid}.partGroups.${grp.key}.nameEn`);
      }
      for (const p of plugin.parts) {
        assertZeroCjkInEnglish(p.nameEn, `${wid}.parts.${p.id}.nameEn`);
      }
      assertZeroCjkInEnglish(bundle.uiMetaEn, `${wid}.uiMetaEn`);
      assertZeroCjkInEnglish(bundle.story.en, `${wid}.story.en`);

      // Verify all timeline presets & firing phases have English translations
      for (const preset of plugin.timelinePresets) {
        const tr = bundle.uiMetaEn.timelinePresets[preset.id];
        expect(
          tr,
          `${wid}: missing English timeline preset ${preset.id}`
        ).toBeDefined();
        expect(tr.label.length).toBeGreaterThan(2);
      }
      for (const ph of plugin.firingPhases) {
        const tr = bundle.uiMetaEn.firingPhases[ph.id];
        expect(
          tr,
          `${wid}: missing English firing phase ${ph.id}`
        ).toBeDefined();
        expect(tr.shortLabel.length).toBeGreaterThan(2);
        expect(tr.description.length).toBeGreaterThan(15);
      }

      // Verify 4-act bilingual R&D stories, 3 breakthroughs, >=5 milestones & exact Charon TTS hashes
      const expectedWeaponClipCount = 8 + plugin.parts.length * 2;
      expect(Object.keys(ttsHashes)).toHaveLength(expectedWeaponClipCount);

      for (const lang of ['zh', 'en'] as const) {
        const story = bundle.story[lang];
        expect(story.headline.length).toBeGreaterThan(5);
        expect(story.deck.length).toBeGreaterThan(15);
        expect(story.acts).toHaveLength(4);
        expect(story.breakthroughs).toHaveLength(3);
        expect(story.milestones.length).toBeGreaterThanOrEqual(5);

        for (const act of story.acts) {
          expect(act.paragraphs.length).toBeGreaterThanOrEqual(2);
          expect(act.audioScript.length).toBeGreaterThan(35);
          expect(act.audioUrl).toMatch(
            new RegExp(`^audio/${wid}/story_act[1-4]_${lang}\\.mp3$`)
          );
          const expectedSig = sha256Hex(
            `${EXPECTED_TTS_MODEL}|${EXPECTED_TTS_VOICE}|${EXPECTED_TTS_STYLE[lang]}|${act.audioScript}`
          );
          expect(
            ttsHashes[act.audioUrl],
            `${wid}: TTS SHA-256 hash mismatch on ${act.audioUrl}`
          ).toBe(expectedSig);
          totalVerifiedHashes++;
          allReferencedAudioPaths.push(act.audioUrl);
          if (act.focusPartId) {
            expect(
              partIds.has(act.focusPartId),
              `${wid}: invalid act focusPartId ${act.focusPartId}`
            ).toBe(true);
          }
        }

        for (const bt of story.breakthroughs) {
          expect(
            partIds.has(bt.focusPartId),
            `${wid}: invalid breakthrough focusPartId ${bt.focusPartId}`
          ).toBe(true);
          expect(bt.summary.length).toBeGreaterThan(15);
        }
      }

      // Verify 100% part coverage, 0 CJK in English part entries, and bilingual Charon TTS hashes
      expect(Object.keys(bundle.parts)).toHaveLength(plugin.parts.length);
      totalNarratedParts += Object.keys(bundle.parts).length;

      for (const part of plugin.parts) {
        const entry = bundle.parts[part.id];
        expect(
          entry,
          `${wid}: missing narration entry for ${part.id}`
        ).toBeDefined();
        expect(entry.partId).toBe(part.id);
        expect(entry.bomCode).toBe(part.bomCode);
        expect(entry.calloutLabelEn.length).toBeGreaterThan(2);
        expect(entry.calloutLabelEn.length).toBeLessThanOrEqual(32);
        assertZeroCjkInEnglish(
          entry.calloutLabelEn,
          `${wid}.parts.${part.id}.calloutLabelEn`
        );
        assertZeroCjkInEnglish(entry.en, `${wid}.parts.${part.id}.en`);

        for (const lang of ['zh', 'en'] as const) {
          const loc = entry[lang];
          expect(loc.roleTag.length).toBeGreaterThan(2);
          expect(loc.overview.length).toBeGreaterThan(15);
          expect(loc.craftAndMaterial.length).toBeGreaterThan(15);
          expect(loc.kinematicRole.length).toBeGreaterThan(15);
          expect(loc.designHighlight.length).toBeGreaterThan(15);
          expect(loc.audioScript.length).toBeGreaterThan(25);
          expect(loc.audioUrl).toBe(
            `audio/${wid}/parts/${part.id}_${lang}.mp3`
          );
          const expectedPartSig = sha256Hex(
            `${EXPECTED_TTS_MODEL}|${EXPECTED_TTS_VOICE}|${EXPECTED_TTS_STYLE[lang]}|${loc.audioScript}`
          );
          expect(
            ttsHashes[loc.audioUrl],
            `${wid}: TTS SHA-256 hash mismatch on ${loc.audioUrl}`
          ).toBe(expectedPartSig);
          totalVerifiedHashes++;
          allReferencedAudioPaths.push(loc.audioUrl);
        }

        const labelEn = resolvePartCalloutLabel(part, 'en', entry);
        expect(labelEn.length).toBeGreaterThan(2);
        assertZeroCjkInEnglish(labelEn, `${wid}.callout.${part.id}`);
      }

      // Verify English fallbacks & resolved display meta
      const fb = WEAPON_EN_FALLBACKS[wid];
      expect(fb, `missing English fallback for ${wid}`).toBeDefined();
      assertZeroCjkInEnglish(fb, `${wid}.WEAPON_EN_FALLBACKS`);
      const metaEn = resolveWeaponDisplayMeta(wid, 'en', bundle);
      expect(metaEn.name.length).toBeGreaterThan(4);
      expect(metaEn.highlights.length).toBeGreaterThanOrEqual(4);
      assertZeroCjkInEnglish(metaEn, `${wid}.metaEn`);
    }

    // 579 total parts across 23 exhibits -> 184 story MP3s + 1,158 part MP3s = 1,342 MP3 files
    expect(totalNarratedParts).toBe(579);
    expect(allReferencedAudioPaths).toHaveLength(1342);
    expect(totalVerifiedHashes).toBe(1342);

    const countDiskMp3s = (dir: string): number => {
      let n = 0;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) n += countDiskMp3s(full);
        else if (ent.isFile() && ent.name.endsWith('.mp3')) n += 1;
      }
      return n;
    };
    expect(countDiskMp3s(AUDIO_DIR)).toBe(1342);

    for (const relAudio of allReferencedAudioPaths) {
      const fullMp3Path = path.join(ROOT_DIR, 'public', relAudio);
      expect(
        fs.existsSync(fullMp3Path),
        `missing TTS audio file: ${relAudio}`
      ).toBe(true);
      const buf = fs.readFileSync(fullMp3Path);
      expect(
        buf.length,
        `TTS MP3 unexpectedly small: ${relAudio}`
      ).toBeGreaterThan(4096);
      const isId3 = buf.toString('ascii', 0, 3) === 'ID3';
      const isMpegSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
      expect(isId3 || isMpegSync, `invalid MP3 header in ${relAudio}`).toBe(
        true
      );
    }

    // Verify bilingual & story actions on useAppStore
    const store = useAppStore;
    store.getState().returnToArmory();
    store.getState().setLang('zh');
    expect(store.getState().lang).toBe('zh');
    store.getState().toggleLang();
    expect(store.getState().lang).toBe('en');
    store.getState().setLang('zh');

    store.getState().setStoryOpen(true);
    expect(store.getState().storyOpen).toBe(true);
    expect(store.getState().storyMinimized).toBe(false);
    store.getState().setStoryMinimized(true);
    expect(store.getState().storyMinimized).toBe(true);
    store.getState().toggleStoryOpen();
    expect(store.getState().storyOpen).toBe(true);
    expect(store.getState().storyMinimized).toBe(false);

    store.getState().focusStoryPart('ak_bolt');
    expect(store.getState().screen).toBe('workbench');
    expect(store.getState().storyOpen).toBe(true);
    expect(store.getState().storyMinimized).toBe(true);
    expect(store.getState().xrayShells).toBe(true);
    expect(store.getState().selectedPartId).toBe('ak_bolt');

    store.getState().setInspectorMinimized(true);
    expect(store.getState().inspectorMinimized).toBe(true);
    store.getState().selectPart(null);
    expect(store.getState().inspectorMinimized).toBe(false);

    store.getState().returnToArmory();
    expect(store.getState().storyOpen).toBe(false);
    expect(store.getState().storyMinimized).toBe(false);
  });
});

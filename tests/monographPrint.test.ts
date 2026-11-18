import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ENGINEERING_ROLE_ORDER,
  getEngineeringRoleMeta,
} from '../src/engine/materials/engineeringRoles';
import {
  getWeaponFiringTiming,
  isArcheryWeapon,
} from '../src/engine/physics/armoryPhysics';
import { resolveShotForWeapon } from '../src/features/monograph/MonographCaptureRig';
import {
  getMonographDomainLabels,
  getMonographLocalizedStrings,
} from '../src/features/monograph/monographStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../src/i18n/weaponFallbacks';
import {
  projectExplodedPartAnchors,
  solveExplodedPinLayout,
} from '../src/features/monograph/explodedPinLayout';
import {
  buildMonographCacheKey,
  cancelMonographCapture,
  completeMonographCapture,
  getCachedMonographBundle,
  getMonographCaptureState,
  MONOGRAPH_PLATE_KEYS,
  type MonographPlateKey,
  requestMonographCapture,
  updateMonographCaptureProgress,
} from '../src/features/monograph/monographCaptureStore';
import { assembleMonographDossier } from '../src/features/monograph/monographDataAssembler';
import {
  buildQrSvgPath,
  computeFormatBits,
  encodeQrMatrix,
} from '../src/features/monograph/qrCodeSvg';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

describe('Collector Military Monograph Print Studio Contracts', () => {
  beforeEach(() => {
    cancelMonographCapture();
    useAppStore.getState().closeMonographModal();
  });

  it('matches ISO/IEC 18004 Annex C format info vector and generates valid QR finder patterns & SVG paths', () => {
    // ISO/IEC 18004 Annex C Table C.1: ECC Level L (01), Mask 0 (000) -> 0b111011111000100 (0x77c4)
    expect(computeFormatBits(0b01, 0)).toBe(0x77c4);

    const url =
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/?weapon=ak15&screen=workbench&lang=zh';
    const matrix = encodeQrMatrix(url);
    const n = matrix.length;

    expect(n).toBeGreaterThanOrEqual(29);
    expect((n - 17) % 4).toBe(0);

    // Top-left, top-right, and bottom-left 7x7 finder outer corners + center dark module
    for (const [tr, tc] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ] as const) {
      expect(matrix[tr][tc]).toBe(true);
      expect(matrix[tr][tc + 6]).toBe(true);
      expect(matrix[tr + 6][tc]).toBe(true);
      expect(matrix[tr + 6][tc + 6]).toBe(true);
      expect(matrix[tr + 3][tc + 3]).toBe(true);
      expect(matrix[tr + 1][tc + 1]).toBe(false);
    }

    // Mandatory dark module at (n - 8, 8)
    expect(matrix[n - 8][8]).toBe(true);

    const svg = buildQrSvgPath(matrix, 2);
    expect(svg.viewSize).toBe(n + 4);
    expect(svg.pathD.startsWith('M')).toBe(true);
    expect(svg.pathD.length).toBeGreaterThan(200);
  });

  it('assembles complete bilingual 8-page monograph dossiers across all 13 weapons using real narration bundles', async () => {
    const narrationsDir = path.resolve(__dirname, '../public/narrations');

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const jsonPath = path.join(narrationsDir, `${weaponId}.json`);
      const bundle = JSON.parse(
        fs.readFileSync(jsonPath, 'utf8')
      ) as WeaponNarrationBundle;

      for (const lang of ['zh', 'en'] as const) {
        const dossier = assembleMonographDossier(
          weaponId,
          plugin,
          lang,
          bundle,
          'https://armory.example.org/'
        );

        expect(dossier.weaponId).toBe(weaponId);
        expect(dossier.serialCode).toContain('DA-2026-BAY-');
        expect(dossier.kidTagline.length).toBeGreaterThan(8);
        expect(dossier.kidsFunStats.length).toBe(4);
        expect(dossier.subAssemblyCards.length).toBe(4);
        for (const bag of dossier.subAssemblyCards) {
          expect(bag.partCount).toBeGreaterThan(0);
          expect(MONOGRAPH_PLATE_KEYS).toContain(bag.plateKey);
        }
        expect(dossier.comicFrames.length).toBe(4);
        for (const frame of dossier.comicFrames) {
          expect(frame.title.length).toBeGreaterThan(1);
          expect(frame.caption.length).toBeGreaterThan(4);
          expect(MONOGRAPH_PLATE_KEYS).toContain(frame.plateKey);
        }
        expect(dossier.acts.length).toBe(4);
        expect(dossier.breakthroughs.length).toBeGreaterThanOrEqual(3);
        expect(dossier.milestones.length).toBeGreaterThanOrEqual(4);
        expect(dossier.firingPhases.length).toBe(7);
        expect(dossier.bomRows.length).toBe(plugin.parts.length);
        expect(dossier.fieldStripRows.length).toBeGreaterThanOrEqual(4);
        expect(dossier.malfunctionCards.length).toBe(4);

        // Sum of parts assigned across the 6 engineering roles equals total parts count
        for (const r of dossier.roleSummaries) {
          expect(r.kidTeamTitle.length).toBeGreaterThan(2);
          expect(r.kidShortTip.length).toBeGreaterThan(4);
        }
        const totalRoleParts = dossier.roleSummaries.reduce(
          (acc, r) => acc + r.parts.length,
          0
        );
        expect(totalRoleParts).toBe(plugin.parts.length);

        expect(dossier.deepLinkUrl).toBe(
          `https://armory.example.org/?weapon=${weaponId}&screen=workbench&lang=${lang}`
        );
        expect(dossier.qrSvg.pathD.length).toBeGreaterThan(150);
      }
    }
  });

  it('computes monotonic non-overlapping top/bottom exploded BOM callout rails across all 13 weapons', async () => {
    const cam = new THREE.PerspectiveCamera(36, 1920 / 1200, 0.1, 640);
    cam.position.set(12, 8, 92);
    cam.lookAt(2, -1, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const anchors = projectExplodedPartAnchors(
        weaponId,
        plugin.parts,
        cam,
        1.0
      );
      const pins = solveExplodedPinLayout(anchors);

      expect(pins.length).toBe(plugin.parts.length);

      for (const pin of pins) {
        expect(pin.badgeU).toBeGreaterThanOrEqual(0.045);
        expect(pin.badgeU).toBeLessThanOrEqual(0.955);
        expect(pin.badgeV).toBeGreaterThan(0.03);
        expect(pin.badgeV).toBeLessThan(0.97);
      }

      for (const rail of ['top', 'bottom'] as const) {
        for (const row of [0, 1] as const) {
          const track = pins
            .filter((p) => p.rail === rail && p.row === row)
            .sort((a, b) => a.badgeU - b.badgeU);
          for (let i = 1; i < track.length; i++) {
            expect(track[i].badgeU - track[i - 1].badgeU).toBeGreaterThan(0.025);
          }
        }
      }
    }
  });

  it('coordinates store modal state and bounded LRU capture cache cleanly', async () => {
    useAppStore.getState().setTextureModalOpen(true);
    useAppStore.getState().setHudHidden(true);

    useAppStore.getState().openMonographModal('m82a1');
    expect(useAppStore.getState().monographModalOpen).toBe(true);
    expect(useAppStore.getState().monographWeaponId).toBe('m82a1');
    expect(useAppStore.getState().textureModalOpen).toBe(false);
    expect(useAppStore.getState().hudHidden).toBe(false);

    expect(MONOGRAPH_PLATE_KEYS.length).toBe(17);
    const reqId = requestMonographCapture('m82a1', 'obsidian_folio', true);
    expect(reqId).toBeGreaterThan(0);
    expect(getMonographCaptureState().activeRequest?.weaponId).toBe('m82a1');
    expect(getMonographCaptureState().totalPlates).toBe(17);

    updateMonographCaptureProgress(reqId, 6, 'stencil_cutaway');
    expect(getMonographCaptureState().completedPlates).toBe(6);

    const mockPlates = Object.fromEntries(
      MONOGRAPH_PLATE_KEYS.map((k) => [k, `data:image/jpeg;base64,${k}`])
    ) as Record<MonographPlateKey, string>;

    completeMonographCapture(reqId, {
      cacheKey: buildMonographCacheKey('m82a1', 'obsidian_folio'),
      weaponId: 'm82a1',
      edition: 'obsidian_folio',
      capturedAtIso: '2026-11-17T00:00:00.000Z',
      plates: mockPlates,
      explodedPins: [],
    });

    expect(getMonographCaptureState().activeRequest).toBeNull();
    expect(getCachedMonographBundle('m82a1', 'obsidian_folio')).not.toBeNull();

    // Verify fallback archery monograph assembly (when bundle is null) resolves ATA/IBO & carbon projectile specs
    for (const archeryId of ['lift33', 'r500'] as const) {
      const plugin = await loadWeaponPlugin(archeryId);
      const dossier = assembleMonographDossier(
        archeryId,
        plugin,
        'en',
        null,
        'https://armory.example.org/'
      );
      expect(dossier.ballisticsSpec.standard).toBe('ATA / IBO');
      expect(dossier.bomRows.length).toBe(plugin.parts.length);
      expect(dossier.acts.length).toBe(4);
    }

    // Subsequent non-forced request hits cache immediately without spawning activeRequest
    const cachedReqId = requestMonographCapture(
      'm82a1',
      'obsidian_folio',
      false
    );
    expect(cachedReqId).toBe(0);
    expect(getMonographCaptureState().activeRequest).toBeNull();
  });

  it('emits archery malfunction codes, getEngineeringRoleMeta labels, and archery domain copy for lift33 and r500', async () => {
    const narrationsDir = path.resolve(__dirname, '../public/narrations');
    const firearmMalfunctionRe =
      /Stovepipe|Double Feed|Light Strike|Out-of-Battery|烟囱卡壳|双进弹|底火轻敲|弹匣/i;
    const firearmRoleLeakRe =
      /breech|propellant|striker|magazine|膛压|火药燃气|枪机框|弹匣/i;

    for (const archeryId of ['lift33', 'r500'] as const) {
      const plugin = await loadWeaponPlugin(archeryId);
      const bundle = JSON.parse(
        fs.readFileSync(path.join(narrationsDir, `${archeryId}.json`), 'utf8')
      ) as WeaponNarrationBundle;

      for (const lang of ['zh', 'en'] as const) {
        const dossier = assembleMonographDossier(
          archeryId,
          plugin,
          lang,
          bundle,
          'https://armory.example.org/'
        );

        expect(dossier.isArchery).toBe(true);
        expect(dossier.malfunctionCards.map((c) => c.code)).toEqual([
          'ARCHERY · VANE',
          'ARCHERY · NOCK',
          'ARCHERY · LATCH',
          'SAFETY · ADF',
        ]);
        for (const card of dossier.malfunctionCards) {
          const text = `${card.badge} ${card.title} ${card.rootCause} ${card.drillSummary}`;
          expect(text).not.toMatch(firearmMalfunctionRe);
        }

        expect(dossier.roleSummaries.length).toBe(
          ENGINEERING_ROLE_ORDER.length
        );
        for (const summary of dossier.roleSummaries) {
          const expectedMeta = getEngineeringRoleMeta(summary.role, archeryId);
          const firearmMeta = getEngineeringRoleMeta(summary.role, 'ak15');
          expect(summary.label).toBe(
            lang === 'zh' ? expectedMeta.labelZh : expectedMeta.labelEn
          );
          expect(summary.shortLabel).toBe(
            lang === 'zh' ? expectedMeta.shortZh : expectedMeta.shortEn
          );
          expect(summary.desc).toBe(
            lang === 'zh' ? expectedMeta.descZh : expectedMeta.descEn
          );
          expect(summary.colorHex).toBe(expectedMeta.colorHex);
          expect(summary.label).not.toBe(
            lang === 'zh' ? firearmMeta.labelZh : firearmMeta.labelEn
          );
          expect(`${summary.label} ${summary.desc}`).not.toMatch(
            firearmRoleLeakRe
          );
          expect(summary.kidTeamTitle).not.toMatch(
            /安全锁小队|往返滑块队|Safety Lock Team|Sliding Carrier Team/
          );
        }

        const domainLabels = getMonographDomainLabels(lang, true);
        const microStrings = getMonographLocalizedStrings(lang);
        if (lang === 'en') {
          expect(JSON.stringify(domainLabels)).not.toMatch(/[\u4e00-\u9fff]/);
          expect(microStrings.focusPrefix).toBe('FOCUS: ');
        } else {
          expect(microStrings.focusPrefix).toBe('聚焦零件：');
        }
        expect(domainLabels.barrelLabel).not.toMatch(/Rifling|枪管/);
        expect(domainLabels.muzzleVelLabel).not.toMatch(/Muzzle|枪口/);

        const partById = new Map(plugin.parts.map((p) => [p.id, p]));
        const archMaterials = UI_STRINGS[lang].inspector.archery.materials;
        for (const row of dossier.bomRows) {
          const part = partById.get(row.partId)!;
          expect(row.materialLabel).toBe(archMaterials[part.material]);
          expect(row.materialLabel).not.toMatch(
            /Cartridge Alloy|Chrome-Lined Barrel|Phosphated Alloy|碳氮共渗|冷锻精密枪管钢|黄铜合金示意/
          );
        }
        const allMaterialsText = dossier.bomRows
          .map((r) => r.materialLabel)
          .join(' | ');
        expect(allMaterialsText).toContain('7075-T6');
        expect(allMaterialsText).toContain('3K');
        expect(allMaterialsText).toContain('BCY-X');
      }
    }

    // Firearms continue to emit standard TYPE-1/2/3/OOB diagnostics, firearm role metadata, and firearm BOM materials
    for (const firearmId of ['ak15', 'g17'] as const) {
      const plugin = await loadWeaponPlugin(firearmId);
      const dossier = assembleMonographDossier(
        firearmId,
        plugin,
        'en',
        null,
        'https://armory.example.org/'
      );
      expect(dossier.isArchery).toBe(false);
      expect(dossier.malfunctionCards.map((c) => c.code)).toEqual([
        'TYPE-2 · FTE',
        'TYPE-3 · DBL',
        'TYPE-1 · FTF',
        'SAFETY · OOB',
      ]);
      for (const summary of dossier.roleSummaries) {
        expect(summary.label).toBe(
          getEngineeringRoleMeta(summary.role, firearmId).labelEn
        );
      }
      const partById = new Map(plugin.parts.map((p) => [p.id, p]));
      for (const row of dossier.bomRows) {
        const part = partById.get(row.partId)!;
        expect(row.materialLabel).toBe(
          UI_STRINGS.en.inspector.materials[part.material]
        );
      }
    }
  });

  it('resolves all 17 SHOT_PLAN plates via resolveShotForWeapon across all 13 weapons with calibrated milestones', () => {
    type ShotInput = Parameters<typeof resolveShotForWeapon>[0];
    const baseShotPlan: readonly ShotInput[] = [
      {
        key: 'cover_hero',
        explodeT: 0,
        showTurntable: true,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 18,
        elevationDeg: 9.5,
        fillX: 0.85,
        fillY: 0.8,
      },
      {
        key: 'ortho_right',
        explodeT: 0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 0,
        elevationDeg: 1,
        fillX: 0.88,
        fillY: 0.82,
      },
      {
        key: 'ortho_left',
        explodeT: 0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 180,
        elevationDeg: 1,
        fillX: 0.88,
        fillY: 0.82,
      },
      {
        key: 'ortho_top',
        explodeT: 0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 0,
        elevationDeg: 83,
        fillX: 0.88,
        fillY: 0.78,
      },
      {
        key: 'xray_magic',
        explodeT: 0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: true,
        engineeringTint: false,
        azimuthDeg: 11,
        elevationDeg: 7,
        fillX: 0.87,
        fillY: 0.82,
      },
      {
        key: 'stencil_cutaway',
        explodeT: 0,
        showTurntable: false,
        sectionCut: true,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 3.5,
        elevationDeg: 3.5,
        fillX: 0.88,
        fillY: 0.82,
      },
      {
        key: 'functional_roles',
        explodeT: 0.34,
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: true,
        azimuthDeg: 22,
        elevationDeg: 15,
        fillX: 0.86,
        fillY: 0.8,
      },
      {
        key: 'exploded_bom',
        explodeT: 1.0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 10,
        elevationDeg: 7.5,
        fillX: 0.85,
        fillY: 0.67,
      },
      {
        key: 'group_slide',
        explodeT: 0.25,
        isolatedGroup: 'slide',
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 20,
        elevationDeg: 14,
        fillX: 0.82,
        fillY: 0.78,
      },
      {
        key: 'group_frame',
        explodeT: 0.2,
        isolatedGroup: 'frame',
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 18,
        elevationDeg: 12,
        fillX: 0.84,
        fillY: 0.78,
      },
      {
        key: 'group_fcg',
        explodeT: 0.28,
        isolatedGroup: 'fire_control',
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 22,
        elevationDeg: 15,
        fillX: 0.8,
        fillY: 0.76,
      },
      {
        key: 'group_mag',
        explodeT: 0.26,
        isolatedGroup: 'magazine',
        showTurntable: false,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 24,
        elevationDeg: 14,
        fillX: 0.8,
        fillY: 0.78,
      },
      {
        key: 'comic_1_ready',
        explodeT: 0,
        firingF: 0.02,
        showTurntable: false,
        sectionCut: true,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 8,
        elevationDeg: 5,
        fillX: 0.87,
        fillY: 0.82,
      },
      {
        key: 'comic_2_ignition',
        explodeT: 0,
        firingF: 0.17,
        showTurntable: false,
        sectionCut: true,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 8,
        elevationDeg: 5,
        fillX: 0.87,
        fillY: 0.82,
      },
      {
        key: 'comic_3_eject',
        explodeT: 0,
        firingF: 0.48,
        showTurntable: false,
        sectionCut: true,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 10,
        elevationDeg: 7,
        fillX: 0.87,
        fillY: 0.82,
      },
      {
        key: 'comic_4_reload',
        explodeT: 0,
        firingF: 0.8,
        showTurntable: false,
        sectionCut: false,
        xrayShells: true,
        engineeringTint: false,
        azimuthDeg: 10,
        elevationDeg: 7,
        fillX: 0.87,
        fillY: 0.82,
      },
      {
        key: 'breech_closeup',
        explodeT: 0,
        showTurntable: false,
        sectionCut: false,
        xrayShells: true,
        engineeringTint: false,
        azimuthDeg: 14,
        elevationDeg: 10,
        fillX: 0.86,
        fillY: 0.8,
        useManifestCloseFocus: true,
      },
    ];

    expect(baseShotPlan.map((s) => s.key)).toEqual(MONOGRAPH_PLATE_KEYS);

    for (const weaponId of WEAPON_IDS) {
      const resolved = baseShotPlan.map((s) =>
        resolveShotForWeapon(s, weaponId)
      );
      const byKey = new Map(resolved.map((s) => [s.key, s]));

      for (const shot of resolved) {
        expect(Number.isFinite(shot.explodeT)).toBe(true);
        expect(shot.explodeT).toBeGreaterThanOrEqual(0);
        expect(shot.explodeT).toBeLessThanOrEqual(1);
        if (shot.firingF !== undefined) {
          expect(Number.isFinite(shot.firingF)).toBe(true);
          expect(shot.firingF).toBeGreaterThanOrEqual(0);
          expect(shot.firingF).toBeLessThanOrEqual(1);
        }
      }

      if (isArcheryWeapon(weaponId)) {
        for (const comicKey of [
          'comic_1_ready',
          'comic_2_ignition',
          'comic_3_eject',
          'comic_4_reload',
        ] as const) {
          expect(byKey.get(comicKey)?.sectionCut).toBe(false);
        }
        expect(byKey.get('comic_1_ready')?.firingF).toBeCloseTo(0.27, 6);
        expect(byKey.get('comic_2_ignition')?.firingF).toBeCloseTo(0.36, 6);
        expect(byKey.get('comic_3_eject')?.firingF).toBeCloseTo(0.5, 6);
        expect(byKey.get('comic_4_reload')?.firingF).toBeCloseTo(0.78, 6);
        expect(byKey.get('stencil_cutaway')?.sectionCut).toBe(true);

        if (weaponId === 'lift33') {
          expect(byKey.get('breech_closeup')?.xrayShells).toBe(false);
          expect(byKey.get('comic_4_reload')?.xrayShells).toBe(false);
        } else {
          expect(byKey.get('breech_closeup')?.xrayShells).toBe(true);
          expect(byKey.get('comic_4_reload')?.xrayShells).toBe(true);
        }
      } else {
        const timing = getWeaponFiringTiming(weaponId);
        expect(byKey.get('comic_2_ignition')?.firingF).toBeCloseTo(
          (timing.ignitionF + timing.muzzleExitF) * 0.52,
          6
        );
        expect(byKey.get('comic_3_eject')?.firingF).toBeCloseTo(
          Math.min(0.74, timing.ejectF + 0.02),
          6
        );
      }
    }

    // Explicit regression guard on slow bolt-action (awm) and short-recoil (m82a1) milestones
    const comic2 = baseShotPlan.find((s) => s.key === 'comic_2_ignition')!;
    const comic3 = baseShotPlan.find((s) => s.key === 'comic_3_eject')!;
    const awmIgnition = resolveShotForWeapon(comic2, 'awm').firingF!;
    const awmEject = resolveShotForWeapon(comic3, 'awm').firingF!;
    expect(awmIgnition).not.toBeCloseTo(0.17, 2);
    expect(awmIgnition).toBeCloseTo((0.252 + 0.345) * 0.52, 6);
    expect(awmEject).not.toBeCloseTo(0.48, 2);
    expect(awmEject).toBeCloseTo(0.715, 6);

    const m82Ignition = resolveShotForWeapon(comic2, 'm82a1').firingF!;
    const m82Eject = resolveShotForWeapon(comic3, 'm82a1').firingF!;
    expect(m82Ignition).toBeCloseTo((0.138 + 0.195) * 0.52, 6);
    expect(m82Eject).not.toBeCloseTo(0.48, 2);
    expect(m82Eject).toBeCloseTo(0.41, 6);
  });

  it('computes accurate archery speed similes and kids summary stats for lift33 and r500 in zh and en', async () => {
    const expectedVelocity: Record<
      'lift33' | 'r500',
      {
        value: string;
        kmh: string;
        zhKeyword: string;
        enKeyword: string;
      }
    > = {
      lift33: {
        value: '106 m/s',
        kmh: '382 km/h',
        zhKeyword: '高铁',
        enKeyword: 'high-speed train',
      },
      r500: {
        value: '152.4 m/s',
        kmh: '549 km/h',
        zhKeyword: '声音传播速度的一半',
        enKeyword: 'half the speed of sound',
      },
    };

    for (const archeryId of ['lift33', 'r500'] as const) {
      const plugin = await loadWeaponPlugin(archeryId);
      const spec = expectedVelocity[archeryId];

      for (const lang of ['zh', 'en'] as const) {
        const dossier = assembleMonographDossier(
          archeryId,
          plugin,
          lang,
          null,
          'https://armory.example.org/'
        );

        const [lenStat, weightStat, partsStat, speedStat] = dossier.kidsFunStats;
        expect(lenStat.value).toMatch(/mm$/);
        expect(weightStat.value).toMatch(/kg$/);
        expect(partsStat.funCompare).toContain(
          lang === 'zh' ? '碳纤维' : 'carbon & alloy'
        );

        expect(speedStat.value).toBe(spec.value);
        expect(speedStat.funCompare).toContain(spec.kmh);
        expect(speedStat.funCompare).toContain(
          lang === 'zh' ? spec.zhKeyword : spec.enKeyword
        );
        expect(speedStat.funCompare).not.toMatch(/超音速|faster than sound/i);

        if (lang === 'en') {
          expect(
            dossier.kidsFunStats
              .map((s) => `${s.label} ${s.value} ${s.funCompare}`)
              .join(' ')
          ).not.toMatch(/[\u4e00-\u9fff]/);
        }

        expect(dossier.comicFrames.map((f) => f.title).join(' ')).not.toMatch(
          /抛壳|Eject/
        );
      }
    }
  });

  it('locks single-source-of-truth English monograph specs and BOM material labels with zero CJK characters across lift33, r500, g17, and p90', async () => {
    const cjkRe = /[\u4e00-\u9fff]/;
    const narrationsDir = path.resolve(__dirname, '../public/narrations');
    const assemblerSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/features/monograph/monographDataAssembler.ts'
      ),
      'utf8'
    );
    expect(assemblerSrc).not.toContain('ARCHERY_EN_SPEC_OVERRIDES');

    for (const id of ['lift33', 'r500', 'g17', 'p90'] as const) {
      const plugin = await loadWeaponPlugin(id);
      const narrationBundle = JSON.parse(
        fs.readFileSync(path.join(narrationsDir, `${id}.json`), 'utf8')
      ) as WeaponNarrationBundle;

      for (const [modeLabel, bundle] of [
        ['null-bundle', null],
        ['narration-bundle', narrationBundle],
      ] as const) {
        const displayMeta = resolveWeaponDisplayMeta(id, 'en', bundle);
        const dossier = assembleMonographDossier(
          id,
          plugin,
          'en',
          bundle,
          'https://armory.example.org/'
        );

        // Single source of truth parity with resolveWeaponDisplayMeta
        expect(dossier.caliberLabel).toBe(displayMeta.caliber);
        expect(dossier.metrics.weight).toBe(displayMeta.weightKg);
        expect(dossier.metrics.muzzleVelocity).toBe(
          displayMeta.muzzleVelocityMs
        );
        expect(dossier.metrics.effectiveRange).toBe(
          displayMeta.effectiveRangeM
        );

        for (const [fieldName, fieldVal] of [
          ['caliberLabel', dossier.caliberLabel],
          ['weight', dossier.metrics.weight],
          ['muzzleVelocity', dossier.metrics.muzzleVelocity],
          ['effectiveRange', dossier.metrics.effectiveRange],
          ['oal', dossier.metrics.oal],
          ['barrel', dossier.metrics.barrel],
          ['rateOfFire', dossier.metrics.rateOfFire],
        ] as const) {
          expect(
            fieldVal.trim().length,
            `${id} (${modeLabel}) ${fieldName} empty`
          ).toBeGreaterThan(0);
          expect(
            fieldVal,
            `${id} (${modeLabel}) ${fieldName} CJK leak`
          ).not.toMatch(cjkRe);
        }

        expect(dossier.bomRows.length).toBe(plugin.parts.length);
        for (const row of dossier.bomRows) {
          expect(
            row.materialLabel.trim().length,
            `${id} (${modeLabel}) ${row.partId} materialLabel empty`
          ).toBeGreaterThan(0);
          expect(
            row.materialLabel,
            `${id} (${modeLabel}) ${row.partId} materialLabel CJK leak`
          ).not.toMatch(cjkRe);
        }
      }
    }
  });
});

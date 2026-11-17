import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('assembles complete bilingual 8-page monograph dossiers across all 11 firearms using real narration bundles', async () => {
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
        expect(dossier.acts.length).toBe(4);
        expect(dossier.breakthroughs.length).toBeGreaterThanOrEqual(3);
        expect(dossier.milestones.length).toBeGreaterThanOrEqual(4);
        expect(dossier.firingPhases.length).toBe(7);
        expect(dossier.bomRows.length).toBe(plugin.parts.length);
        expect(dossier.fieldStripRows.length).toBeGreaterThanOrEqual(4);
        expect(dossier.malfunctionCards.length).toBe(4);

        // Sum of parts assigned across the 6 engineering roles equals total parts count
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

  it('computes monotonic non-overlapping top/bottom exploded BOM callout rails across all 11 firearms', async () => {
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

  it('coordinates store modal state and bounded LRU capture cache cleanly', () => {
    useAppStore.getState().setTextureModalOpen(true);
    useAppStore.getState().setHudHidden(true);

    useAppStore.getState().openMonographModal('m82a1');
    expect(useAppStore.getState().monographModalOpen).toBe(true);
    expect(useAppStore.getState().monographWeaponId).toBe('m82a1');
    expect(useAppStore.getState().textureModalOpen).toBe(false);
    expect(useAppStore.getState().hudHidden).toBe(false);

    const reqId = requestMonographCapture('m82a1', 'obsidian_folio', true);
    expect(reqId).toBeGreaterThan(0);
    expect(getMonographCaptureState().activeRequest?.weaponId).toBe('m82a1');

    updateMonographCaptureProgress(reqId, 3, 'stencil_cutaway');
    expect(getMonographCaptureState().completedPlates).toBe(3);

    completeMonographCapture(reqId, {
      cacheKey: buildMonographCacheKey('m82a1', 'obsidian_folio'),
      weaponId: 'm82a1',
      edition: 'obsidian_folio',
      capturedAtIso: '2026-11-17T00:00:00.000Z',
      plates: {
        cover_hero: 'data:image/jpeg;base64,AA',
        breech_closeup: 'data:image/jpeg;base64,BB',
        stencil_cutaway: 'data:image/jpeg;base64,CC',
        functional_roles: 'data:image/jpeg;base64,DD',
        exploded_bom: 'data:image/jpeg;base64,EE',
      },
      explodedPins: [],
    });

    expect(getMonographCaptureState().activeRequest).toBeNull();
    expect(getCachedMonographBundle('m82a1', 'obsidian_folio')).not.toBeNull();

    // Subsequent non-forced request hits cache immediately without spawning activeRequest
    const cachedReqId = requestMonographCapture(
      'm82a1',
      'obsidian_folio',
      false
    );
    expect(cachedReqId).toBe(0);
    expect(getMonographCaptureState().activeRequest).toBeNull();
  });
});

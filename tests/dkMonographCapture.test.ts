import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedDkMasterPlateManifest,
  getWeaponMasterPlates,
  hasCyclesMasterPlates,
  loadDkMasterPlateManifest,
  parseDkMasterPlateManifest,
  resetDkMasterPlateManifestCacheForTests,
  resolveMasterPlateUrl,
} from '../src/features/monograph/dkMasterPlates';
import {
  type DkCalloutItem,
  type ExplodedPinAnchorInput,
  projectExplodedPartAnchors,
  projectLoupeAnchors,
  solveDkAnnotatedCallouts,
} from '../src/features/monograph/explodedPinLayout';
import {
  cleanTransparentAlphaEdge,
  compositeDkSoftContactShadow,
  computeAlphaSilhouetteBounds,
  flipRgbaRowsVertical,
  resolveCaptureDimensions,
  resolveShotForWeapon,
  shouldApplyDkContactShadow,
} from '../src/features/monograph/MonographCaptureRig';
import {
  buildMonographCacheKey,
  cancelMonographCapture,
  clearMonographCacheForTests,
  completeMonographCapture,
  getCachedMonographBundle,
  getMonographCaptureState,
  MONOGRAPH_PLATE_KEYS,
  type MonographPlateKey,
  requestMonographCapture,
} from '../src/features/monograph/monographCaptureStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

function orientation2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Returns true if open segment AB strictly crosses open segment CD (excluding shared endpoints).
 */
function segmentsProperlyIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const eps = 1e-7;
  const o1 = orientation2d(ax, ay, bx, by, cx, cy);
  const o2 = orientation2d(ax, ay, bx, by, dx, dy);
  const o3 = orientation2d(cx, cy, dx, dy, ax, ay);
  const o4 = orientation2d(cx, cy, dx, dy, bx, by);
  return (
    ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
    ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
  );
}

function assertNoCalloutCrossings(callouts: readonly DkCalloutItem[]): void {
  const segments: Array<{
    partId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> = [];

  for (const c of callouts) {
    segments.push({
      partId: c.partId,
      x1: c.anchorU,
      y1: c.anchorV,
      x2: c.kneeU,
      y2: c.kneeV,
    });
    segments.push({
      partId: c.partId,
      x1: c.kneeU,
      y1: c.kneeV,
      x2: c.labelU,
      y2: c.labelV,
    });
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].partId === segments[j].partId) continue;
      const a = segments[i];
      const b = segments[j];
      const crosses = segmentsProperlyIntersect(
        a.x1,
        a.y1,
        a.x2,
        a.y2,
        b.x1,
        b.y1,
        b.x2,
        b.y2
      );
      expect(crosses).toBe(false);
    }
  }
}

describe('DK Visual Encyclopedia Capture Engine & Callout Solver', () => {
  beforeEach(() => {
    clearMonographCacheForTests();
    resetDkMasterPlateManifestCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cancelMonographCapture();
  });

  describe('solveDkAnnotatedCallouts & projectLoupeAnchors', () => {
    it('solves non-crossing, collision-free, group-diverse DK callouts across all 34 exhibits', async () => {
      const cam = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 680);
      cam.position.set(16, 10, 86);
      cam.lookAt(2, -1, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      for (const weaponId of WEAPON_IDS) {
        const plugin = await loadWeaponPlugin(weaponId);

        for (const [explodeT, maxCallouts] of [
          [0, 10],
          [1.0, 12],
        ] as const) {
          const anchors = projectExplodedPartAnchors(
            weaponId,
            plugin.parts,
            cam,
            explodeT
          );
          const callouts = solveDkAnnotatedCallouts(anchors, maxCallouts);

          expect(callouts.length).toBeGreaterThan(0);
          expect(callouts.length).toBeLessThanOrEqual(maxCallouts);

          // Determinism under reversed input ordering
          const reversed = solveDkAnnotatedCallouts(
            [...anchors].reverse(),
            maxCallouts
          );
          expect(reversed).toEqual(callouts);

          // Group diversity: all present assembly groups represented
          const availableGroups = new Set(anchors.map((a) => a.group));
          const chosenGroups = new Set(callouts.map((c) => c.group));
          if (maxCallouts >= availableGroups.size) {
            expect(chosenGroups.size).toBe(availableGroups.size);
          }

          // Bounded normalized coordinates & positive priority
          for (const c of callouts) {
            expect(c.anchorU).toBeGreaterThan(0);
            expect(c.anchorU).toBeLessThan(1);
            expect(c.anchorV).toBeGreaterThan(0);
            expect(c.anchorV).toBeLessThan(1);
            expect(c.kneeU).toBeGreaterThan(0);
            expect(c.kneeU).toBeLessThan(1);
            expect(c.kneeV).toBeGreaterThan(0);
            expect(c.kneeV).toBeLessThan(1);
            expect(c.labelU).toBeGreaterThan(0);
            expect(c.labelU).toBeLessThan(1);
            expect(c.labelV).toBeGreaterThan(0);
            expect(c.labelV).toBeLessThan(1);
            expect(c.priority).toBeGreaterThanOrEqual(1);
          }

          // Strict monotonic spacing on top/bottom and left/right rails
          for (const side of ['top', 'bottom'] as const) {
            const rail = callouts.filter((c) => c.side === side);
            for (let i = 1; i < rail.length; i++) {
              expect(
                rail[i].labelU - rail[i - 1].labelU
              ).toBeGreaterThanOrEqual(0.12);
              expect(rail[i].kneeU).toBeGreaterThan(rail[i - 1].kneeU);
            }
          }
          for (const side of ['left', 'right'] as const) {
            const rail = callouts.filter((c) => c.side === side);
            for (let i = 1; i < rail.length; i++) {
              expect(
                rail[i].labelV - rail[i - 1].labelV
              ).toBeGreaterThanOrEqual(0.12);
              expect(rail[i].kneeV).toBeGreaterThan(rail[i - 1].kneeV);
            }
          }

          // Zero 0.35pt leader crossings across the entire plate
          assertNoCalloutCrossings(callouts);
        }
      }
    });

    it('routes tall vertical silhouettes cleanly to left/right DK margins and handles ties/empty inputs', () => {
      expect(solveDkAnnotatedCallouts([], 10)).toEqual([]);

      const tallBowAnchors: ExplodedPinAnchorInput[] = [
        {
          partId: 'top_cam',
          bomCode: 'S-01',
          group: 'slide',
          preferredDir: 'up',
          anchorU: 0.44,
          anchorV: 0.16,
        },
        {
          partId: 'upper_limb',
          bomCode: 'F-01',
          group: 'frame',
          preferredDir: 'up',
          anchorU: 0.56,
          anchorV: 0.28,
        },
        {
          partId: 'arrow_rest',
          bomCode: 'T-01',
          group: 'fire_control',
          preferredDir: 'up',
          anchorU: 0.48,
          anchorV: 0.44,
        },
        {
          partId: 'riser_grip',
          bomCode: 'F-02',
          group: 'frame',
          preferredDir: 'down',
          anchorU: 0.52,
          anchorV: 0.54,
        },
        {
          partId: 'quiver_mount',
          bomCode: 'M-01',
          group: 'magazine',
          preferredDir: 'down',
          anchorU: 0.46,
          anchorV: 0.68,
        },
        {
          partId: 'bottom_cam',
          bomCode: 'S-02',
          group: 'slide',
          preferredDir: 'down',
          anchorU: 0.54,
          anchorV: 0.84,
        },
      ];

      const callouts = solveDkAnnotatedCallouts(tallBowAnchors, 6);
      expect(callouts.length).toBe(6);
      expect(callouts.some((c) => c.side === 'left')).toBe(true);
      expect(callouts.some((c) => c.side === 'right')).toBe(true);
      for (const c of callouts) {
        if (c.side === 'left') expect(c.align).toBe('right');
        if (c.side === 'right') expect(c.align).toBe('left');
      }
      assertNoCalloutCrossings(callouts);

      // Exact U-tie stress test on horizontal layout
      const tiedAnchors: ExplodedPinAnchorInput[] = [
        {
          partId: 'p1',
          bomCode: 'A-01',
          group: 'slide',
          preferredDir: 'up',
          anchorU: 0.5,
          anchorV: 0.25,
        },
        {
          partId: 'p2',
          bomCode: 'A-02',
          group: 'frame',
          preferredDir: 'up',
          anchorU: 0.5,
          anchorV: 0.36,
        },
        {
          partId: 'p3',
          bomCode: 'A-03',
          group: 'fire_control',
          preferredDir: 'down',
          anchorU: 0.2,
          anchorV: 0.62,
        },
        {
          partId: 'p4',
          bomCode: 'A-04',
          group: 'magazine',
          preferredDir: 'down',
          anchorU: 0.82,
          anchorV: 0.68,
        },
      ];
      const tiedSolved = solveDkAnnotatedCallouts(tiedAnchors, 4);
      expect(tiedSolved.length).toBe(4);
      assertNoCalloutCrossings(tiedSolved);
    });

    it('projects all 5 DK circular loupe anchors accurately across all 34 exhibits', async () => {
      const cam = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 680);
      cam.position.set(14, 8, 72);
      cam.lookAt(2, 0, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);

      const expectedKeys = [
        'group_slide',
        'group_frame',
        'group_fcg',
        'group_mag',
        'breech_closeup',
      ] as const;

      for (const weaponId of WEAPON_IDS) {
        const plugin = await loadWeaponPlugin(weaponId);
        const anchors = projectLoupeAnchors(weaponId, plugin.parts, cam);

        for (const key of expectedKeys) {
          const pt = anchors[key];
          expect(pt).toBeDefined();
          expect(Number.isFinite(pt!.u)).toBe(true);
          expect(Number.isFinite(pt!.v)).toBe(true);
          expect(pt!.u).toBeGreaterThanOrEqual(0.04);
          expect(pt!.u).toBeLessThanOrEqual(0.96);
          expect(pt!.v).toBeGreaterThanOrEqual(0.06);
          expect(pt!.v).toBeLessThanOrEqual(0.94);
        }
      }
    });
  });

  describe('monographCaptureStore quality keying & backward compatibility', () => {
    const mockPlates = Object.fromEntries(
      MONOGRAPH_PLATE_KEYS.map((k) => [k, `data:image/png;base64,${k}`])
    ) as Record<MonographPlateKey, string>;

    it('keys cache distinctly by (weaponId, edition, quality) while defaulting quality to standard_1440', () => {
      expect(buildMonographCacheKey('p08', 'dk_encyclopedia')).toBe(
        'p08:dk_encyclopedia:standard_1440:v3'
      );
      expect(
        buildMonographCacheKey('p08', 'dk_encyclopedia', 'print_2880')
      ).toBe('p08:dk_encyclopedia:print_2880:v3');

      const reqStd = requestMonographCapture(
        'p08',
        'dk_encyclopedia',
        false,
        'standard_1440'
      );
      expect(reqStd).toBeGreaterThan(0);
      expect(getMonographCaptureState().activeRequest?.quality).toBe(
        'standard_1440'
      );

      completeMonographCapture(reqStd, {
        cacheKey: buildMonographCacheKey(
          'p08',
          'dk_encyclopedia',
          'standard_1440'
        ),
        weaponId: 'p08',
        edition: 'dk_encyclopedia',
        quality: 'standard_1440',
        capturedAtIso: '2026-11-19T12:00:00.000Z',
        plates: mockPlates,
        plateSources: { cover_hero: 'cycles_4k', ortho_right: 'webgl_1440' },
        explodedPins: [],
        dkHeroCallouts: [],
        dkCutawayCallouts: [],
        dkExplodedCallouts: [],
        loupeAnchors: { breech_closeup: { u: 0.52, v: 0.44 } },
      });

      // Standard cache hit does not interfere with print_2880 cache miss
      expect(
        getCachedMonographBundle('p08', 'dk_encyclopedia', 'standard_1440')
      ).not.toBeNull();
      expect(getCachedMonographBundle('p08', 'dk_encyclopedia')).not.toBeNull();
      expect(
        getCachedMonographBundle('p08', 'dk_encyclopedia', 'print_2880')
      ).toBeNull();

      expect(requestMonographCapture('p08', 'dk_encyclopedia', false)).toBe(0);

      const reqPrint = requestMonographCapture(
        'p08',
        'dk_encyclopedia',
        false,
        'print_2880'
      );
      expect(reqPrint).toBeGreaterThan(0);
      expect(getMonographCaptureState().activeRequest?.quality).toBe(
        'print_2880'
      );
    });

    it('preserves backward compatibility for legacy bundle inputs missing v3 fields', () => {
      const reqId = requestMonographCapture('ak15', 'obsidian_folio', true);
      completeMonographCapture(reqId, {
        cacheKey: buildMonographCacheKey('ak15', 'obsidian_folio'),
        weaponId: 'ak15',
        edition: 'obsidian_folio',
        capturedAtIso: '2026-11-19T12:00:00.000Z',
        plates: mockPlates,
        explodedPins: [],
      });

      const cached = getCachedMonographBundle('ak15', 'obsidian_folio');
      expect(cached).not.toBeNull();
      expect(cached!.quality).toBe('standard_1440');
      expect(cached!.plateSources).toEqual({});
      expect(cached!.dkHeroCallouts).toEqual([]);
      expect(cached!.dkCutawayCallouts).toEqual([]);
      expect(cached!.dkExplodedCallouts).toEqual([]);
      expect(cached!.loupeAnchors).toEqual({});
    });
  });

  describe('dkMasterPlates manifest loader & subpath resolution', () => {
    it('resolves plate URLs cleanly under both root `/` and `/digital-armory-3d/` deployments', () => {
      const entry = {
        file: 'plates/p08/cover_hero.webp',
        width: 2880,
        height: 1800,
      };
      expect(resolveMasterPlateUrl(entry, '/')).toBe(
        '/plates/p08/cover_hero.webp'
      );
      expect(resolveMasterPlateUrl(entry, '/digital-armory-3d/')).toBe(
        '/digital-armory-3d/plates/p08/cover_hero.webp'
      );
      expect(
        resolveMasterPlateUrl(
          { file: '/plates/ak15/ortho_right.webp' },
          '/digital-armory-3d/'
        )
      ).toBe('/digital-armory-3d/plates/ak15/ortho_right.webp');
      expect(
        resolveMasterPlateUrl(
          { file: 'https://cdn.example.org/plates/p08/cover_hero.webp' },
          '/digital-armory-3d/'
        )
      ).toBe('https://cdn.example.org/plates/p08/cover_hero.webp');
    });

    it('falls back gracefully to an empty manifest on 404 or fetch rejection', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      );

      const m404 = await loadDkMasterPlateManifest('/');
      expect(m404).toEqual({ version: 1, weapons: {} });
      expect(getCachedDkMasterPlateManifest()).toEqual({
        version: 1,
        weapons: {},
      });
      expect(hasCyclesMasterPlates('p08')).toBe(false);

      resetDkMasterPlateManifestCacheForTests();
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('Offline network error')
      );

      const mOffline = await loadDkMasterPlateManifest('/digital-armory-3d/');
      expect(mOffline).toEqual({ version: 1, weapons: {} });
      expect(getWeaponMasterPlates('ak15')).toBeNull();
    });

    it('parses, sanitizes, and caches valid Blender Cycles master-plate manifests', async () => {
      const mockJson = {
        version: 1,
        generatedAt: '2026-11-19T12:00:00Z',
        weapons: {
          p08: {
            renderer: 'Blender 5.2 Cycles',
            resolution: [2880, 1800],
            transparent: true,
            plates: {
              cover_hero: {
                file: 'plates/p08/cover_hero.webp',
                width: 2880,
                height: 1800,
                azimuthDeg: 18,
                elevationDeg: 9.5,
                fovDeg: 36,
              },
              invalid_plate_key: {
                file: 'plates/p08/bogus.webp',
                width: 100,
                height: 100,
              },
            },
          },
          nonexistent_gun: {
            renderer: 'Bogus',
            resolution: [100, 100],
            transparent: true,
            plates: {
              cover_hero: { file: 'plates/x.webp', width: 100, height: 100 },
            },
          },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const [first, second] = await Promise.all([
        loadDkMasterPlateManifest('/digital-armory-3d/'),
        loadDkMasterPlateManifest('/digital-armory-3d/'),
      ]);

      // Deduplicated in-flight request
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        '/digital-armory-3d/plates/manifest.json',
        { cache: 'no-cache' }
      );
      expect(first).toBe(second);
      expect(hasCyclesMasterPlates('p08')).toBe(true);
      expect(hasCyclesMasterPlates('g17')).toBe(false);

      const p08 = getWeaponMasterPlates('p08');
      expect(p08?.renderer).toBe('Blender 5.2 Cycles');
      expect(p08?.plates.cover_hero?.fovDeg).toBe(36);
      expect(Object.keys(p08?.plates ?? {})).toEqual(['cover_hero']);

      // Direct parser resilience against malformed payloads
      expect(parseDkMasterPlateManifest(null)).toEqual({
        version: 1,
        weapons: {},
      });
    });
  });

  describe('Capture resolution, DK shot specs & transparent alpha matting / soft shadow math', () => {
    it('resolves standard_1440 and print_2880 dimensions and clamps safely to GPU maxTextureSize', () => {
      expect(resolveCaptureDimensions('standard_1440', 4096)).toEqual({
        width: 1440,
        height: 900,
      });
      expect(resolveCaptureDimensions('print_2880', 4096)).toEqual({
        width: 2880,
        height: 1800,
      });

      const clamped = resolveCaptureDimensions('print_2880', 2048);
      expect(clamped).toEqual({ width: 2048, height: 1280 });
      expect(clamped.width / clamped.height).toBeCloseTo(16 / 10, 4);
    });

    it('disables dark turntable pedestal on cover_hero exclusively for dk_encyclopedia', () => {
      const heroBase = {
        key: 'cover_hero' as const,
        explodeT: 0,
        showTurntable: true,
        sectionCut: false,
        xrayShells: false,
        engineeringTint: false,
        azimuthDeg: 18,
        elevationDeg: 9.5,
        fillX: 0.85,
        fillY: 0.8,
      };
      expect(
        resolveShotForWeapon(heroBase, 'p08', 'dk_encyclopedia').showTurntable
      ).toBe(false);
      expect(
        resolveShotForWeapon(heroBase, 'p08', 'blueprint_manual').showTurntable
      ).toBe(true);
      expect(resolveShotForWeapon(heroBase, 'p08').showTurntable).toBe(true);
    });

    it('flips WebGL rows, cleans alpha dust, and composites soft DK contact shadows strictly beneath weapon silhouettes', () => {
      const w = 120;
      const h = 80;
      const bottomUp = new Uint8Array(w * h * 4);
      const topDown = new Uint8ClampedArray(w * h * 4);

      // Paint a crisp opaque steel block at top-down rows y=[20..44], x=[30..90]
      // (which corresponds to bottom-up rows by = h - 1 - y)
      for (let y = 20; y <= 44; y++) {
        const by = h - 1 - y;
        for (let x = 30; x <= 90; x++) {
          const idx = (by * w + x) * 4;
          bottomUp[idx] = 72;
          bottomUp[idx + 1] = 84;
          bottomUp[idx + 2] = 98;
          bottomUp[idx + 3] = 255;
        }
      }
      // Paint a 50%-alpha antialiased edge pixel right along bottom edge (x=60, y=45)
      const edgeBy = h - 1 - 45;
      const edgeSrcIdx = (edgeBy * w + 60) * 4;
      bottomUp[edgeSrcIdx] = 180;
      bottomUp[edgeSrcIdx + 1] = 180;
      bottomUp[edgeSrcIdx + 2] = 180;
      bottomUp[edgeSrcIdx + 3] = 128;

      // Paint stray background alpha dust (a = 2) at top-left corner (x=2, y=2)
      const dustBy = h - 1 - 2;
      const dustSrcIdx = (dustBy * w + 2) * 4;
      bottomUp[dustSrcIdx] = 40;
      bottomUp[dustSrcIdx + 1] = 40;
      bottomUp[dustSrcIdx + 2] = 40;
      bottomUp[dustSrcIdx + 3] = 2;

      flipRgbaRowsVertical(bottomUp, topDown, w, h);

      // Verify cleanTransparentAlphaEdge strips dust before shadow pass
      cleanTransparentAlphaEdge(topDown, 2);
      const dustDstIdx = (2 * w + 2) * 4;
      expect(topDown[dustDstIdx + 3]).toBe(0);
      expect(topDown[dustDstIdx]).toBe(0);

      const bounds = compositeDkSoftContactShadow(topDown, w, h, {
        peakOpacity: 0.22,
      });
      expect(bounds).not.toBeNull();
      expect(bounds!.minX).toBe(30);
      expect(bounds!.maxX).toBe(90);
      expect(bounds!.minY).toBe(20);
      expect(bounds!.maxY).toBe(45);

      // 1. Solid opaque weapon interior pixels must be 100% untouched
      const solidIdx = (32 * w + 60) * 4;
      expect(topDown[solidIdx]).toBe(72);
      expect(topDown[solidIdx + 1]).toBe(84);
      expect(topDown[solidIdx + 2]).toBe(98);
      expect(topDown[solidIdx + 3]).toBe(255);

      // 2. Outer paper margins far from the weapon remain genuinely transparent rgba(0,0,0,0)
      for (const [px, py] of [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [60, 5],
      ] as const) {
        const idx = (py * w + px) * 4;
        expect(topDown[idx]).toBe(0);
        expect(topDown[idx + 1]).toBe(0);
        expect(topDown[idx + 2]).toBe(0);
        expect(topDown[idx + 3]).toBe(0);
      }

      // 3. Pixel directly under the weapon center (x=60, y=46) receives soft translucent shadow
      const shadowIdx = (46 * w + 60) * 4;
      expect(topDown[shadowIdx + 3]).toBeGreaterThan(10);
      expect(topDown[shadowIdx + 3]).toBeLessThan(80);

      // 4. Semi-transparent antialiased edge pixel blends cleanly OVER the shadow (higher alpha, preserves fg brightness)
      const edgeDstIdx = (45 * w + 60) * 4;
      expect(topDown[edgeDstIdx + 3]).toBeGreaterThan(128);
      expect(topDown[edgeDstIdx]).toBeGreaterThan(120);

      // 5. Empty transparent buffer returns null cleanly without throwing
      const emptyBuf = new Uint8ClampedArray(32 * 20 * 4);
      expect(computeAlphaSilhouetteBounds(emptyBuf, 32, 20)).toBeNull();
      expect(compositeDkSoftContactShadow(emptyBuf, 32, 20)).toBeNull();

      // 6. Shadow eligibility distinguishes grounded studio plates from floating technical plates
      expect(shouldApplyDkContactShadow('cover_hero')).toBe(true);
      expect(shouldApplyDkContactShadow('ortho_right')).toBe(true);
      expect(shouldApplyDkContactShadow('group_fcg')).toBe(true);
      expect(shouldApplyDkContactShadow('stencil_cutaway')).toBe(false);
      expect(shouldApplyDkContactShadow('exploded_bom')).toBe(false);
      expect(shouldApplyDkContactShadow('xray_magic')).toBe(false);
    });
  });

  describe('public/plates Cycles master-plate manifest completeness', () => {
    it('ships all 34/34 exhibits × 10 Cycles 2880×1800 RGBA plates (340 WebPs) on disk', () => {
      const manifestPath = path.resolve(
        process.cwd(),
        'public',
        'plates',
        'manifest.json'
      );
      expect(fs.existsSync(manifestPath)).toBe(true);

      const rawJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifest = parseDkMasterPlateManifest(rawJson);

      const requiredShotKeys = [
        'cover_hero',
        'ortho_right',
        'ortho_left',
        'ortho_top',
        'exploded_bom',
        'group_slide',
        'group_frame',
        'group_fcg',
        'group_mag',
        'breech_closeup',
      ] as const;

      let totalVerifiedPlates = 0;
      for (const weaponId of WEAPON_IDS) {
        const entry = manifest.weapons[weaponId];
        expect(entry, `Missing Cycles manifest entry for ${weaponId}`).toBeDefined();
        expect(entry!.resolution).toEqual([2880, 1800]);
        expect(entry!.transparent).toBe(true);

        for (const shotKey of requiredShotKeys) {
          const shot = entry!.plates[shotKey];
          expect(
            shot,
            `Missing shot '${shotKey}' in manifest for ${weaponId}`
          ).toBeDefined();
          expect(shot!.width).toBe(2880);
          expect(shot!.height).toBe(1800);

          const relativeFile = shot!.file.replace(/^\/+/, '');
          const absFile = path.resolve(process.cwd(), 'public', relativeFile);
          expect(
            fs.existsSync(absFile),
            `Missing WebP plate on disk: ${absFile}`
          ).toBe(true);
          expect(fs.statSync(absFile).size).toBeGreaterThan(4096);
          totalVerifiedPlates += 1;
        }
      }

      expect(totalVerifiedPlates).toBe(34 * 10);
    });
  });
});

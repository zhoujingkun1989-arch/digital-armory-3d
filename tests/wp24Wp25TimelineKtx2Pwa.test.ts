import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { resolvePreferredTexturePath } from '../src/engine/materials/ktx2Support';
import { buildExhibitOfflineAssetUrls } from '../src/engine/offline/offlineMuseumManager';
import {
  HISTORY_TIMELINE_NODES,
  HISTORY_TIMELINE_TOURS,
  TIMELINE_LINEAGES,
} from '../src/features/timeline/historyTimelineSpecs';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = process.cwd();
const CJK_REGEX = /[\u4e00-\u9fff]/;

describe('WP-24 Timeline & WP-25a KTX2/Basis + PWA Offline Museum', () => {
  it('covers all 29 exhibits across 6 historical lineages with valid ancestors and 0-CJK EN metadata', () => {
    const nodeIds = new Set(HISTORY_TIMELINE_NODES.map((n) => n.weaponId));
    expect(nodeIds.size).toBe(WEAPON_IDS.length);
    for (const id of WEAPON_IDS) {
      expect(nodeIds.has(id)).toBe(true);
    }

    const lineageIds = new Set(TIMELINE_LINEAGES.map((l) => l.id));
    for (const lin of TIMELINE_LINEAGES) {
      expect(CJK_REGEX.test(lin.labelEn)).toBe(false);
      expect(CJK_REGEX.test(lin.summaryEn)).toBe(false);
    }

    for (const node of HISTORY_TIMELINE_NODES) {
      expect(node.year).toBeGreaterThanOrEqual(1415);
      expect(node.year).toBeLessThanOrEqual(2026);
      expect(lineageIds.has(node.lineageId)).toBe(true);
      expect(CJK_REGEX.test(node.designerEn)).toBe(false);
      expect(CJK_REGEX.test(node.innovationEn)).toBe(false);
      for (const anc of node.ancestors) {
        expect(nodeIds.has(anc)).toBe(true);
      }
    }

    expect(HISTORY_TIMELINE_TOURS.length).toBeGreaterThanOrEqual(4);
    for (const tour of HISTORY_TIMELINE_TOURS) {
      expect(CJK_REGEX.test(tour.titleEn)).toBe(false);
      expect(CJK_REGEX.test(tour.subtitleEn)).toBe(false);
      for (const wid of tour.weaponIds) {
        expect(nodeIds.has(wid)).toBe(true);
      }
    }
  });

  it('ships valid Basis transcoder binaries, KTX2 manifest, and seamless WebP fallback URLs', () => {
    const jsPath = path.join(ROOT, 'public/basis/basis_transcoder.js');
    const wasmPath = path.join(ROOT, 'public/basis/basis_transcoder.wasm');
    const manifestPath = path.join(ROOT, 'public/textures/ktx2-manifest.json');

    expect(fs.existsSync(jsPath)).toBe(true);
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(fs.statSync(wasmPath).size).toBeGreaterThan(100_000);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const ktx2Json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(ktx2Json.version).toBe(1);
    expect(typeof ktx2Json.entries).toBe('object');

    const resolved = resolvePreferredTexturePath(
      'ztz99a_v3_hull_albedo.png',
      '/digital-armory-3d/'
    );
    expect(resolved.url).toBe(
      '/digital-armory-3d/textures/ztz99a_v3_hull_albedo.webp'
    );
    expect(resolved.isKtx2).toBe(false);
  });

  it('provides valid subpath-safe PWA manifest, syntactically valid Service Worker, and offline asset manifests', () => {
    const webmanifestPath = path.join(ROOT, 'public/manifest.webmanifest');
    const swPath = path.join(ROOT, 'public/sw.js');

    const wm = JSON.parse(fs.readFileSync(webmanifestPath, 'utf8'));
    expect(wm.start_url).toBe('./index.html');
    expect(wm.scope).toBe('./');
    expect(wm.display).toBe('standalone');

    const swSrc = fs.readFileSync(swPath, 'utf8');
    expect(() => new vm.Script(swSrc)).not.toThrow();

    const tankOffline = buildExhibitOfflineAssetUrls(
      'ztz99a',
      '/digital-armory-3d/'
    );
    expect(tankOffline.urls).toContain(
      '/digital-armory-3d/models/ztz99a.glb'
    );
    expect(tankOffline.urls).toContain(
      '/digital-armory-3d/narrations/ztz99a.json'
    );
    expect(tankOffline.urls).toContain(
      '/digital-armory-3d/textures/ztz99a_v3_armor_hull_albedo.webp'
    );
    expect(tankOffline.urls).toContain(
      '/digital-armory-3d/hdri/heavy_armor_hangar.hdr'
    );
    expect(tankOffline.urls).toContain(
      '/digital-armory-3d/draco/draco_decoder.wasm'
    );
  });
});

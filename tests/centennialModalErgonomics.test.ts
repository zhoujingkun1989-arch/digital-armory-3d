import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ARMOR_HALL_OFFLINE_IDS } from '../src/engine/offline/offlineMuseumManager';
import {
  buildAtlasBakedCoverageNote,
  getBakedAtlasManifests,
  resolveAtlasWeaponTab,
  TextureAtlasModal,
} from '../src/features/atlas/TextureAtlasModal';
import {
  filterOfflineManifests,
  OFFLINE_MUSEUM_STRINGS,
  OfflineMuseumModal,
} from '../src/features/offline/OfflineMuseumModal';
import {
  filterScaleWallExhibits,
  matchesScaleWallHall,
  SCALE_WALL_HALL_FILTERS,
  SCALE_WALL_HALL_LABELS,
  SCALE_WALL_PICKER_UI,
  ScaleWallModal,
} from '../src/features/scalewall/ScaleWallModal';
import { SCALE_WALL_EXHIBITS } from '../src/features/scalewall/scaleWallSpecs';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import type { WeaponId, WeaponManifest } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_OR_FULLWIDTH_RE =
  /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

function withStoreState<T>(
  patch: Partial<ReturnType<typeof useAppStore.getState>>,
  fn: () => T
): T {
  const initialState = useAppStore.getInitialState() as unknown as Record<
    string,
    unknown
  >;
  const liveState = useAppStore.getState() as unknown as Record<string, unknown>;
  const prevInitial: Record<string, unknown> = {};
  const prevLive: Record<string, unknown> = {};
  const keys = Object.keys(patch) as Array<keyof typeof patch>;
  for (const key of keys) {
    const k = key as string;
    prevInitial[k] = initialState[k];
    prevLive[k] = liveState[k];
    initialState[k] = patch[key];
  }
  useAppStore.setState(patch);
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const k = key as string;
      initialState[k] = prevInitial[k];
    }
    useAppStore.setState(
      prevLive as Partial<ReturnType<typeof useAppStore.getState>>
    );
  }
}

describe('100-Weapon Expansion Phase 2L — Modal Ergonomics (ScaleWall, OfflineMuseum, TextureAtlas)', () => {
  it('filters ScaleWall exhibits cleanly across all 10 halls and bilingual multi-token search queries with 0 EN CJK / 0 WP-XX', () => {
    expect(SCALE_WALL_HALL_FILTERS).toHaveLength(10);
    expect(filterScaleWallExhibits(SCALE_WALL_EXHIBITS, 'all', '')).toHaveLength(
      SCALE_WALL_EXHIBITS.length
    );

    // Every specialized hall is a disjoint partition summing to SCALE_WALL_EXHIBITS.length
    let partitionSum = 0;
    for (const hall of SCALE_WALL_HALL_FILTERS) {
      if (hall === 'all') continue;
      const subset = filterScaleWallExhibits(SCALE_WALL_EXHIBITS, hall, '');
      expect(subset.length).toBeGreaterThan(0);
      for (const item of subset) {
        expect(matchesScaleWallHall(item, hall)).toBe(true);
      }
      partitionSum += subset.length;
    }
    expect(partitionSum).toBe(SCALE_WALL_EXHIBITS.length);

    // Multi-token bilingual search (EN, ZH, caliber, year, bay)
    const tankSearch = filterScaleWallExhibits(
      SCALE_WALL_EXHIBITS,
      'armor',
      'tiger 1942'
    );
    expect(tankSearch.map((e) => e.weaponId)).toEqual(['tiger1']);

    const zhSearch = filterScaleWallExhibits(
      SCALE_WALL_EXHIBITS,
      'all',
      '加兰德'
    );
    expect(zhSearch.some((e) => e.weaponId === 'garand')).toBe(true);

    const baySearch = filterScaleWallExhibits(
      SCALE_WALL_EXHIBITS,
      'ordnance',
      '#34'
    );
    expect(baySearch.map((e) => e.weaponId)).toEqual(['gau8']);

    expect(
      filterScaleWallExhibits(SCALE_WALL_EXHIBITS, 'pistol', 'ztz99a')
    ).toHaveLength(0);

    // Zero EN CJK & zero WP-XX across EN labels & SSR markup
    for (const hall of SCALE_WALL_HALL_FILTERS) {
      expect(CJK_OR_FULLWIDTH_RE.test(SCALE_WALL_HALL_LABELS[hall].en)).toBe(
        false
      );
      expect(WP_LEAK_RE.test(SCALE_WALL_HALL_LABELS[hall].en)).toBe(false);
    }
    expect(CJK_OR_FULLWIDTH_RE.test(SCALE_WALL_PICKER_UI.en.searchPlaceholder)).toBe(
      false
    );
    expect(CJK_OR_FULLWIDTH_RE.test(SCALE_WALL_PICKER_UI.en.emptyText)).toBe(
      false
    );

    const enHtml = withStoreState({ lang: 'en' }, () =>
      renderToStaticMarkup(
        React.createElement(ScaleWallModal, { onClose: () => {} })
      )
    );
    expect(enHtml).toContain('data-testid="scalewall-exhibit-search"');
    expect(enHtml).toContain('data-testid="scalewall-hall-filters"');
    expect(enHtml).toContain('data-testid="scalewall-hall-all"');
    expect(enHtml).toContain('data-testid="scalewall-hall-armor"');
    expect(enHtml).toContain('data-testid="scalewall-hall-ordnance"');
    expect(CJK_OR_FULLWIDTH_RE.test(enHtml)).toBe(false);
    expect(WP_LEAK_RE.test(enHtml)).toBe(false);
  });

  it('filters OfflineMuseum manifests interactively by hall & bilingual query and dynamically tracks ARMOR_HALL_OFFLINE_IDS length', () => {
    expect(filterOfflineManifests(WEAPON_MANIFESTS, 'all', '')).toHaveLength(
      WEAPON_MANIFESTS.length
    );

    const armorPack = filterOfflineManifests(WEAPON_MANIFESTS, 'armor', '');
    expect(armorPack.length).toBeGreaterThanOrEqual(4);
    expect(armorPack.every((m) => m.catalog.category === 'armor')).toBe(true);

    const gau8Hit = filterOfflineManifests(
      WEAPON_MANIFESTS,
      'ordnance',
      '30×173'
    );
    expect(gau8Hit.map((m) => m.id)).toEqual(['gau8']);

    const zhHit = filterOfflineManifests(WEAPON_MANIFESTS, 'pistol', '鲁格');
    expect(zhHit.map((m) => m.id)).toEqual(['p08']);

    // Dynamic armor hall batch button count
    expect(OFFLINE_MUSEUM_STRINGS.en.cacheArmorHallBtn).toContain(
      `(${ARMOR_HALL_OFFLINE_IDS.length})`
    );
    expect(OFFLINE_MUSEUM_STRINGS.zh.cacheArmorHallBtn).toContain(
      `(${ARMOR_HALL_OFFLINE_IDS.length})`
    );
    expect(
      CJK_OR_FULLWIDTH_RE.test(OFFLINE_MUSEUM_STRINGS.en.searchPlaceholder)
    ).toBe(false);
    expect(
      CJK_OR_FULLWIDTH_RE.test(OFFLINE_MUSEUM_STRINGS.en.emptyFilterText)
    ).toBe(false);

    const enHtml = withStoreState({ lang: 'en' }, () =>
      renderToStaticMarkup(
        React.createElement(OfflineMuseumModal, { onClose: () => {} })
      )
    );
    expect(enHtml).toContain('data-testid="offline-exhibit-search"');
    expect(enHtml).toContain('data-testid="offline-hall-filter-all"');
    expect(enHtml).toContain('data-testid="offline-hall-filter-armor"');
    expect(enHtml).toContain('data-testid="offline-hall-filter-ordnance"');
    expect(enHtml).toContain('aria-pressed="true"');
    expect(CJK_OR_FULLWIDTH_RE.test(enHtml)).toBe(false);
    expect(WP_LEAK_RE.test(enHtml)).toBe(false);
  });

  it('filters TextureAtlasModal tabs strictly to baked 2K/4K Cycles ORM exhibits and falls back cleanly to ak15 for procedural CAD IDs', () => {
    const baked = getBakedAtlasManifests(WEAPON_MANIFESTS);
    expect(baked).toHaveLength(34);

    // Simulate a 100-exhibit manifest list containing a procedural Centennial exhibit without baked ORM strings
    const syntheticCentennial = {
      ...WEAPON_MANIFESTS[0],
      id: 'ak47' as unknown as WeaponId,
    } as WeaponManifest;
    const mixedManifests: WeaponManifest[] = [
      ...WEAPON_MANIFESTS,
      syntheticCentennial,
    ];
    const filteredBaked = getBakedAtlasManifests(mixedManifests);
    expect(filteredBaked).toHaveLength(34);
    expect(filteredBaked.some((m) => (m.id as string) === 'ak47')).toBe(false);

    // Valid baked exhibit keeps its tab; non-baked Centennial exhibit falls back cleanly to 'ak15'
    expect(resolveAtlasWeaponTab('ztz99a', filteredBaked)).toBe('ztz99a');
    expect(
      resolveAtlasWeaponTab('ak47' as unknown as WeaponId, filteredBaked)
    ).toBe('ak15');

    // Coverage note is strictly bilingual with 0 EN CJK and 0 WP-XX
    const note100En = buildAtlasBakedCoverageNote(34, 100, 'en');
    const note100Zh = buildAtlasBakedCoverageNote(34, 100, 'zh');
    expect(note100En).toContain('34');
    expect(note100En).toContain('66');
    expect(CJK_OR_FULLWIDTH_RE.test(note100En)).toBe(false);
    expect(WP_LEAK_RE.test(note100En)).toBe(false);
    expect(note100Zh).toContain('34');
    expect(note100Zh).toContain('66');
    expect(WP_LEAK_RE.test(note100Zh)).toBe(false);

    const enHtml = withStoreState({ lang: 'en', activeWeaponId: 'gau8' }, () =>
      renderToStaticMarkup(
        React.createElement(TextureAtlasModal, { forceOpen: true })
      )
    );
    expect(enHtml).toContain('data-testid="atlas-baked-coverage-note"');
    expect(CJK_OR_FULLWIDTH_RE.test(enHtml)).toBe(false);
    expect(WP_LEAK_RE.test(enHtml)).toBe(false);
  });

  it('enforces Blueprint Daylight, >= 34px mobile touch targets, balanced CSS braces & 0 WP-XX across edited stylesheets', () => {
    for (const rel of [
      'src/styles/scale-wall.css',
      'src/styles/offline-museum.css',
    ]) {
      const css = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect((css.match(/\{/g) ?? []).length, `${rel}: unbalanced braces`).toBe(
        (css.match(/\}/g) ?? []).length
      );
      expect(css, `${rel}: missing daylight theme`).toContain(
        "[data-theme='light']"
      );
      expect(css, `${rel}: missing >= 34px mobile target`).toContain(
        'min-height: 34px'
      );
      expect(WP_LEAK_RE.test(css), `${rel}: WP-XX leak`).toBe(false);
    }
  });
});

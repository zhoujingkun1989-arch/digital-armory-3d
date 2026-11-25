import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ArmoryView,
  shouldIgnoreArmoryArrowKeyEvent,
} from '../src/features/armory/ArmoryView';
import {
  filterArmoryWeaponsByQuery,
  matchesCategoryWithLmg,
  type ArmoryFilterKey,
} from '../src/features/armory/armorySortFilter';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { ARMORY_WEAPONS } from '../src/weapons/manifests';
import { MUSEUM_EXHIBIT_COUNT } from '../src/weapons/museumMetrics';
import type { ArmoryWeaponItem } from '../src/weapons/types';

const NINE_NON_ALL_HALLS: readonly Exclude<ArmoryFilterKey, 'all'>[] = [
  'assault',
  'lmg',
  'smg',
  'sniper',
  'shotgun',
  'pistol',
  'archery',
  'armor',
  'ordnance',
];

const CJK_REGEX = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

describe('Armory Inline Quick-Search & 10-Hall Category Guard (Phase 2M)', () => {
  it('returns an exact non-mutating identity copy for empty or whitespace queries', () => {
    const empty = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '');
    const spaces = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '   \t\n  ');

    expect(empty).not.toBe(ARMORY_WEAPONS);
    expect(empty.map((w) => w.id)).toEqual(ARMORY_WEAPONS.map((w) => w.id));
    expect(spaces.map((w) => w.id)).toEqual(ARMORY_WEAPONS.map((w) => w.id));
  });

  it('supports case-insensitive multi-token bilingual AND matching across name, English meta, caliber, year, country, action, and bayCode', () => {
    // Chinese exhibit & year multi-token
    const tiger = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '虎式 1942');
    expect(tiger.map((w) => w.id)).toEqual(['tiger1']);

    // Localized English fallback name
    const avenger = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, 'avenger');
    expect(avenger.map((w) => w.id)).toEqual(['gau8']);

    const luger = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, 'LUGER 1900');
    expect(luger.map((w) => w.id)).toEqual(['p08']);

    // Caliber with ASCII 'x' normalized against Unicode '×'
    const x39 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '7.62x39');
    expect(x39.map((w) => w.id)).toContain('ak15');

    const glock9 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '9x19 glock');
    expect(glock9.map((w) => w.id)).toEqual(['g17']);

    const gau30 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '30x173');
    expect(gau30.map((w) => w.id)).toEqual(['gau8']);

    // Design year & country + type multi-token AND
    const mg42 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '1942 德国 机枪');
    expect(mg42.map((w) => w.id)).toEqual(['mg42']);

    const m1911 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, '1911 .45');
    expect(m1911.map((w) => w.id)).toEqual(['m1911']);

    // Bay code case-insensitive lookup
    const bay34 = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, 'bay-34');
    expect(bay34.map((w) => w.id)).toEqual(['gau8']);

    // Zero-match query
    const none = filterArmoryWeaponsByQuery(ARMORY_WEAPONS, 'nonexistent_xyz_999');
    expect(none).toEqual([]);
  });

  it('partitions all 10 halls with zero leakage and guarantees ordnance never matches lmg or assault', () => {
    let totalAcrossNineHalls = 0;
    for (const item of ARMORY_WEAPONS) {
      expect(matchesCategoryWithLmg(item, 'all')).toBe(true);
      const matchedHalls = NINE_NON_ALL_HALLS.filter((hall) =>
        matchesCategoryWithLmg(item, hall)
      );
      expect(
        matchedHalls,
        `${item.id} must belong to exactly one non-all hall`
      ).toHaveLength(1);
      totalAcrossNineHalls += matchedHalls.length;
    }
    expect(totalAcrossNineHalls).toBe(ARMORY_WEAPONS.length);

    // Explicit guard for real GAU-8/A and synthetic Centennial ordnance exhibits
    const gau8 = ARMORY_WEAPONS.find((w) => w.id === 'gau8')!;
    expect(matchesCategoryWithLmg(gau8, 'ordnance')).toBe(true);
    expect(matchesCategoryWithLmg(gau8, 'lmg')).toBe(false);
    expect(matchesCategoryWithLmg(gau8, 'assault')).toBe(false);

    const syntheticOrdnanceItems: ArmoryWeaponItem[] = [
      {
        ...gau8,
        id: 'm61vulcan' as ArmoryWeaponItem['id'],
        bayCode: 'BAY-98',
        nameCn: 'M61A1 火神 20mm 航空旋转机炮',
        weaponTypeCn: '20mm 航空六管旋转机枪/机炮',
        category: 'ordnance',
        categoryCn: '航空重武',
      },
      {
        ...gau8,
        id: 'bofors40' as ArmoryWeaponItem['id'],
        bayCode: 'BAY-99',
        nameCn: '博福斯 40mm 自动高炮',
        weaponTypeCn: '40mm 自动高射机炮',
        category: 'ordnance',
        categoryCn: '航空重武',
      },
      {
        ...gau8,
        id: 'm777' as ArmoryWeaponItem['id'],
        bayCode: 'BAY-100',
        nameCn: 'M777A2 155mm 超轻型榴弹炮',
        weaponTypeCn: '155mm 牵引榴弹炮',
        category: 'ordnance',
        categoryCn: '航空重武',
      },
    ];

    for (const ord of syntheticOrdnanceItems) {
      expect(matchesCategoryWithLmg(ord, 'all')).toBe(true);
      expect(matchesCategoryWithLmg(ord, 'ordnance')).toBe(true);
      expect(matchesCategoryWithLmg(ord, 'lmg')).toBe(false);
      expect(matchesCategoryWithLmg(ord, 'assault')).toBe(false);
      expect(matchesCategoryWithLmg(ord, 'armor')).toBe(false);
    }

    // LMGs remain cleanly in 'lmg' and never leak into 'assault' or 'ordnance'
    for (const lmgId of ['m249', 'm134', 'mg42'] as const) {
      const lmg = ARMORY_WEAPONS.find((w) => w.id === lmgId)!;
      expect(matchesCategoryWithLmg(lmg, 'lmg')).toBe(true);
      expect(matchesCategoryWithLmg(lmg, 'assault')).toBe(false);
      expect(matchesCategoryWithLmg(lmg, 'ordnance')).toBe(false);
    }
  });

  it('renders inline quick-search bar, dynamic exhibit count placeholder, empty reset CTA, zero EN CJK, and arrow-key input guard', () => {
    const enUi = UI_STRINGS.en.armory;
    const enSamples = [
      enUi.quickSearchAria,
      enUi.quickSearchPlaceholder(MUSEUM_EXHIBIT_COUNT),
      enUi.quickSearchClearAria,
      enUi.quickSearchEmptyTitle('test'),
      enUi.quickSearchResetBtn,
    ];
    for (const txt of enSamples) {
      expect(CJK_REGEX.test(txt), `0 EN CJK in "${txt}"`).toBe(false);
    }

    const htmlZh = renderToStaticMarkup(
      React.createElement(ArmoryView, {
        langOverride: 'zh',
        weaponIdOverride: 'ak15',
      })
    );
    expect(htmlZh).toContain('data-testid="armory-bay-search-input"');
    expect(htmlZh).toContain(`搜 ${MUSEUM_EXHIBIT_COUNT} 款展品`);

    const htmlEnEmpty = renderToStaticMarkup(
      React.createElement(ArmoryView, {
        langOverride: 'en',
        weaponIdOverride: 'ak15',
        initialSearchQuery: 'zzz_no_match_999',
      })
    );
    expect(htmlEnEmpty).toContain('data-testid="armory-bay-search-input"');
    expect(htmlEnEmpty).toContain('data-testid="armory-bay-search-clear"');
    expect(htmlEnEmpty).toContain('data-testid="armory-search-reset-btn"');
    expect(htmlEnEmpty).toContain('Reset Search &amp; Show All Halls');
    expect(htmlEnEmpty).toContain(
      `Search ${MUSEUM_EXHIBIT_COUNT} exhibits (name, caliber, year)...`
    );

    // Focusing the quick-search <input> must never trigger global ←/→ bay switching
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowLeft',
        targetTagName: 'INPUT',
      })
    ).toBe(true);
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowRight',
        targetTagName: 'INPUT',
      })
    ).toBe(true);
  });
});

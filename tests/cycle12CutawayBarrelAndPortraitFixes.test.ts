import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
} from '../src/app/useUrlStateSync';
import { shouldSliceBarrelForRifling } from '../src/engine/actors/PartActor';
import { RIFLING_EXPLODE_VISIBILITY_MAX } from '../src/engine/actors/RiflingBoreActor';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import {
  PORTRAIT_PHONE_DISTANCE_MULT,
  computePortraitPhoneDistanceMultiplier,
} from '../src/engine/canvas/ArmoryViewport';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');

function extractAllUseFrameBodies(source: string): string {
  let combined = '';
  let searchFrom = 0;
  while (true) {
    const idx = source.indexOf('useFrame(', searchFrom);
    if (idx === -1) break;
    const arrowIdx = source.indexOf('=>', idx);
    if (arrowIdx === -1) break;
    const openBrace = source.indexOf('{', arrowIdx);
    if (openBrace === -1) break;

    let depth = 1;
    let cursor = openBrace + 1;
    while (cursor < source.length && depth > 0) {
      const ch = source[cursor];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      cursor++;
    }
    combined += '\n' + source.slice(openBrace, cursor);
    searchFrom = cursor;
  }
  return combined;
}

describe('Cycle 12A.1 — P0 Barrel Cutaway Slicing for 3D Helical Rifling Bore', () => {
  it('slices exactly 1 main barrel part on all 32 barreled exhibits and 0 parts on archery when assembled Z cutaway is active', async () => {
    const spotChecked: Record<string, string> = {};

    for (const id of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(id);
      const spec = WEAPON_RIFLING_SPECS[id];
      const sliced = plugin.parts.filter((part) =>
        shouldSliceBarrelForRifling(id, part, true, 'z', 0, false)
      );

      if (spec.kind === 'none') {
        expect(sliced, `${id} archery must never slice`).toHaveLength(0);
      } else {
        expect(
          sliced,
          `${id} should slice exactly 1 main barrel part`
        ).toHaveLength(1);
        spotChecked[id] = sliced[0].id;
      }
    }

    // Spot-check hero platforms across pistols, rifles, rotating cannons & 1:1 MBTs
    expect(spotChecked.m1911).toBe('m1911_barrel');
    expect(spotChecked.ak15).toBe('ak_barrel');
    expect(spotChecked.g17).toBe('barrel');
    expect(spotChecked.k98k).toBe('k98k_barrel');
    expect(spotChecked.awm).toBe('awm_barrel');
    expect(spotChecked.deagle).toBe('deagle_barrel');
    expect(spotChecked.ztz99a).toBe('ztz99a_main_gun');
    expect(spotChecked.tiger1).toBe('tiger_main_gun');
    expect(spotChecked.gau8).toBe('gau8_barrel_cluster');
  });

  it('never slices non-barrel internals or barrels when exploded (>= 0.04), unselected off, non-Z axis, or selected', async () => {
    const m1911 = await loadWeaponPlugin('m1911');
    const barrel = m1911.parts.find((p) => p.id === 'm1911_barrel')!;

    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'z', 0.0, false)
    ).toBe(true);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'z', 0.039, false)
    ).toBe(true);

    // Threshold boundary & gating checks
    expect(
      shouldSliceBarrelForRifling(
        'm1911',
        barrel,
        true,
        'z',
        RIFLING_EXPLODE_VISIBILITY_MAX,
        false
      )
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'z', 0.5, false)
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, false, 'z', 0, false)
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'x', 0, false)
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'y', 0, false)
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'box', 0, false)
    ).toBe(false);
    expect(
      shouldSliceBarrelForRifling('m1911', barrel, true, 'z', 0, true)
    ).toBe(false);

    // Non-barrel internals (links, bushings, triggers, hammers, springs, magazines) stay strictly uncut
    const nonBarrelIds: readonly string[] = [
      'm1911_barrel_link',
      'm1911_barrel_bushing',
      'm1911_hammer',
      'm1911_leaf_spring',
      'm1911_firing_pin',
      'm1911_mag_body',
    ];
    for (const partId of nonBarrelIds) {
      const part = m1911.parts.find((p) => p.id === partId);
      if (part) {
        expect(
          shouldSliceBarrelForRifling('m1911', part, true, 'z', 0, false),
          partId
        ).toBe(false);
      }
    }

    // Archery exhibits stay strictly uncut
    for (const archId of ['lift33', 'r500'] as const satisfies readonly WeaponId[]) {
      const p = await loadWeaponPlugin(archId);
      for (const part of p.parts) {
        expect(
          shouldSliceBarrelForRifling(archId, part, true, 'z', 0, false)
        ).toBe(false);
      }
    }

    // Verify PartActor suppresses solid StencilSectionCap on sliced barrels so bore stays open
    const partActorSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/actors/PartActor.tsx'),
      'utf8'
    );
    expect(partActorSrc).toContain('!isBarrelRiflingCut');
  });
});

describe('Cycle 12A.2 — Split Showdown ?cut=1 Deep-Link Hydration & Serialization', () => {
  it('hydrates sectionCut=true on ?screen=split_showdown&cut=1 and round-trips cleanly', () => {
    applyLocationToStore(
      '?screen=split_showdown&weaponA=m1911&weaponB=deagle&cut=1'
    );
    const stCut = useAppStore.getState();
    expect(stCut.screen).toBe('split_showdown');
    expect(stCut.splitShowdownWeaponA).toBe('m1911');
    expect(stCut.splitShowdownWeaponB).toBe('deagle');
    expect(stCut.sectionCut).toBe(true);

    const qsCut = buildSearchString(
      'm1911',
      'split_showdown',
      'explode',
      true,
      'en',
      '45_acp',
      true,
      '338_lapua',
      '',
      { weaponA: 'm1911', weaponB: 'deagle' }
    );
    expect(new URLSearchParams(qsCut).get('cut')).toBe('1');
    expect(new URLSearchParams(qsCut).get('weaponA')).toBe('m1911');
    expect(new URLSearchParams(qsCut).get('weaponB')).toBe('deagle');

    // Without ?cut=1, Split Showdown starts cleanly uncut and omits `cut` from URL
    applyLocationToStore('?screen=split_showdown&weaponA=m1911&weaponB=deagle');
    expect(useAppStore.getState().sectionCut).toBe(false);

    const qsUncut = buildSearchString(
      'm1911',
      'split_showdown',
      'explode',
      false,
      'en',
      '45_acp',
      true,
      '338_lapua',
      '?screen=split_showdown&weaponA=m1911&weaponB=deagle&cut=1',
      { weaponA: 'm1911', weaponB: 'deagle' }
    );
    expect(new URLSearchParams(qsUncut).get('cut')).toBeNull();
  });
});

describe('Cycle 12A.3 — Portrait Phone Rifle Framing Margin & Zero-GC useFrame Hygiene', () => {
  it('widens portrait phone distance multiplier to >= 1.26 while keeping desktop 16:9 & tablet 4:3 at exact 1.0', () => {
    expect(PORTRAIT_PHONE_DISTANCE_MULT).toBeGreaterThanOrEqual(1.26);
    expect(computePortraitPhoneDistanceMultiplier(390 / 844)).toBeGreaterThanOrEqual(
      1.26
    );
    expect(computePortraitPhoneDistanceMultiplier(390 / 844)).toBe(
      PORTRAIT_PHONE_DISTANCE_MULT
    );
    expect(computePortraitPhoneDistanceMultiplier(1920 / 1080)).toBe(1.0);
    expect(computePortraitPhoneDistanceMultiplier(1024 / 768)).toBe(1.0);
  });

  it('maintains strict zero `new THREE.` inside useFrame across PartActor, RiflingBoreActor & ArmoryViewport', () => {
    for (const rel of [
      'src/engine/actors/PartActor.tsx',
      'src/engine/actors/RiflingBoreActor.tsx',
      'src/engine/canvas/ArmoryViewport.tsx',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      const body = extractAllUseFrameBodies(src);
      expect(body.length, `${rel} useFrame`).toBeGreaterThan(200);
      expect(body, `${rel} Zero-GC useFrame`).not.toMatch(/\bnew THREE\./);
    }
  });
});

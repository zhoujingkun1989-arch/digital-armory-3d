import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS } from '../src/weapons/expansion/catalog/archeryArmorOrdnance';
import { RIFLES_AND_LMGS_BLUEPRINTS } from '../src/weapons/expansion/catalog/riflesAndLmgs';
import { SHOTGUNS_AND_PISTOLS_BLUEPRINTS } from '../src/weapons/expansion/catalog/shotgunsAndPistols';
import { SMGS_AND_SNIPERS_BLUEPRINTS } from '../src/weapons/expansion/catalog/smgsAndSnipers';
import {
  type CentennialSilhouettePalette,
  renderCentennialWeaponSilhouette,
} from '../src/weapons/expansion/centennialSilhouetteRenderer';
import {
  CENTENNIAL_66_IDS,
  type CentennialArchetype,
  type CentennialWeaponBlueprint,
  type CentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';

const ACTIVE_PALETTE: CentennialSilhouettePalette = {
  stroke: 'var(--silhouette-stroke, #cbd5e1)',
  fill: 'var(--silhouette-fill, #334155)',
  subFill: 'var(--silhouette-subfill, #475569)',
  accent: 'var(--silhouette-accent, #38bdf8)',
  cutout: 'var(--silhouette-cutout, #0d1420)',
};

const MUTED_PALETTE: CentennialSilhouettePalette = {
  stroke: '#64748b',
  fill: 'rgba(100, 116, 139, 0.35)',
  subFill: 'rgba(148, 163, 184, 0.45)',
  accent: '#94a3b8',
  cutout: 'var(--silhouette-cutout, #0d1420)',
};

const ALL_28_ARCHETYPES: readonly CentennialArchetype[] = [
  'ak_rifle',
  'ar_rifle',
  'battle_rifle',
  'bullpup_rifle',
  'lmg_belt',
  'lmg_pan',
  'heavy_mg',
  'smg_tube',
  'smg_drum',
  'smg_pdw',
  'sniper_bolt',
  'sniper_bullpup',
  'sniper_dmr',
  'shotgun_pump',
  'shotgun_auto',
  'shotgun_lever',
  'pistol_slide',
  'pistol_broomhandle',
  'revolver_sa',
  'revolver_da',
  'bow_compound',
  'crossbow_recurve',
  'bow_longbow',
  'mbt_modern',
  'mbt_wwii',
  'rotary_cannon',
  'aa_autocannon',
  'howitzer',
];

const ALL_66_BLUEPRINTS: readonly CentennialWeaponBlueprint[] = [
  ...RIFLES_AND_LMGS_BLUEPRINTS,
  ...SMGS_AND_SNIPERS_BLUEPRINTS,
  ...SHOTGUNS_AND_PISTOLS_BLUEPRINTS,
  ...ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS,
];

function countSvgPrimitives(markup: string): number {
  const matches = markup.match(/<(path|rect|circle|ellipse|line|polygon)\b/g);
  return matches ? matches.length : 0;
}

function assertValidSilhouetteMarkup(markup: string, label: string): void {
  expect(markup, `${label} must start with <svg`).toMatch(/^<svg\b/);
  expect(markup, `${label} must end with </svg>`).toMatch(/<\/svg>$/);
  expect(markup, `${label} viewBox`).toContain('viewBox="0 0 180 86"');
  expect(markup, `${label} class`).toContain('class="weapon-silhouette-svg"');
  expect(markup, `${label} aria-hidden`).toContain('aria-hidden="true"');
  expect(
    countSvgPrimitives(markup),
    `${label} primitive count`
  ).toBeGreaterThanOrEqual(5);
  expect(markup, `${label} zero NaN`).not.toMatch(/\bNaN\b/);
  expect(markup, `${label} zero undefined`).not.toMatch(/\bundefined\b/);
  expect(markup, `${label} zero null`).not.toMatch(/\bnull\b/);
  expect(markup, `${label} zero Infinity`).not.toMatch(/\bInfinity\b/);
}

describe('Centennial 28-Archetype Vector Silhouette Engine (Phase 2E)', () => {
  it('renders valid, distinct SVG silhouettes for all 28 CentennialArchetypes', () => {
    expect(ALL_28_ARCHETYPES).toHaveLength(28);
    const byArchetype = new Map<CentennialArchetype, CentennialWeaponBlueprint>();
    for (const bp of ALL_66_BLUEPRINTS) {
      if (!byArchetype.has(bp.archetype)) {
        byArchetype.set(bp.archetype, bp);
      }
    }

    const renderedByArchetype = new Set<string>();
    for (const archetype of ALL_28_ARCHETYPES) {
      const bp = byArchetype.get(archetype);
      expect(bp, `catalog blueprint missing for archetype ${archetype}`).toBeDefined();
      const markup = renderToStaticMarkup(
        renderCentennialWeaponSilhouette(bp!, ACTIVE_PALETTE)
      );
      assertValidSilhouetteMarkup(markup, `archetype:${archetype}`);
      renderedByArchetype.add(markup);
    }

    expect(renderedByArchetype.size).toBe(28);
  });

  it('renders all 66/66 real Centennial blueprints cleanly under active and muted palettes', () => {
    expect(ALL_66_BLUEPRINTS).toHaveLength(CENTENNIAL_66_IDS.length);
    for (const bp of ALL_66_BLUEPRINTS) {
      const activeSvg = renderToStaticMarkup(
        renderCentennialWeaponSilhouette(bp, ACTIVE_PALETTE)
      );
      assertValidSilhouetteMarkup(activeSvg, `active:${bp.id}`);

      const mutedSvg = renderToStaticMarkup(
        renderCentennialWeaponSilhouette(bp, MUTED_PALETTE)
      );
      assertValidSilhouetteMarkup(mutedSvg, `muted:${bp.id}`);
      // Muted palette must not leak active walnut/bakelite/yew hex overrides.
      expect(mutedSvg).not.toContain('#7a4b2a');
      expect(mutedSvg).not.toContain('#8c5a2b');
      expect(mutedSvg).not.toContain('#a64d24');
    }
  });

  it('differentiates iconic signature siblings & dynamic CAD features', () => {
    const byId = new Map(ALL_66_BLUEPRINTS.map((bp) => [bp.id, bp]));
    const renderById = (id: CentennialWeaponId) =>
      renderToStaticMarkup(
        renderCentennialWeaponSilhouette(byId.get(id)!, ACTIVE_PALETTE)
      );

    // Rifles & Bullpups & LMGs
    expect(new Set(['ak47', 'ak74m', 'stg44', 'rpk74'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(4);
    expect(new Set(['m16a1', 'hk416', 'g36c', 'xm7'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(4);
    expect(new Set(['fnfal', 'g3a3', 'm14', 'sks', 'bar1918'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(5);
    expect(new Set(['famas', 'qbz95', 'tavor'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(3);
    expect(new Set(['pkm', 'm240b', 'm60e4', 'dp28', 'm2hb'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(5);

    // smg_drum: PPSh-41 circular 71-rd drum vs Bizon under-barrel helical tube
    const ppshSvg = renderById('ppsh41');
    const bizonSvg = renderById('bizon');
    expect(ppshSvg).not.toBe(bizonSvg);
    expect(ppshSvg).toContain('<circle');

    // shotgun_auto: SPAS-12 folding hook vs AA-12 drum vs Saiga-12 box
    expect(new Set(['spas12', 'aa12', 'saiga12'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(3);

    // smg_tube: Uzi vs MP40 vs Sten
    expect(new Set(['uzi', 'mp40', 'sten'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(3);

    // Armor: T-90M vs Challenger 2 vs Merkava Mk.4 vs T-34-85
    expect(new Set(['t90m', 'challenger2', 'merkava4', 't34_85'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(4);

    // Pistol & Revolver siblings
    expect(new Set(['usp45', 'beretta92', 'ppk', 'fiveseven', 'c96', 'saa1873', 'sw500'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(7);

    // Archery siblings
    expect(new Set(['hoytrx8', 'excalibur', 'englishlongbow'].map((id) => renderById(id as CentennialWeaponId))).size).toBe(3);

    // Dynamic CAD flag modulations on a single blueprint
    const hk416 = byId.get('hk416')!;
    const variants = [
      hk416,
      { ...hk416, cad: { ...hk416.cad, hasOptic: false } },
      { ...hk416, cad: { ...hk416.cad, hasCarryHandle: true } },
      { ...hk416, cad: { ...hk416.cad, hasBipod: true } },
      { ...hk416, cad: { ...hk416.cad, muzzleStyle: 'suppressor' as const } },
    ].map((bp) =>
      renderToStaticMarkup(renderCentennialWeaponSilhouette(bp, ACTIVE_PALETTE))
    );
    expect(new Set(variants).size).toBe(5);
  });

  it('enforces Pure Leaf import hygiene (ONLY React runtime import; zero catalog/store imports)', () => {
    const rendererPath = resolve(
      process.cwd(),
      'src/weapons/expansion/centennialSilhouetteRenderer.tsx'
    );
    const source = readFileSync(rendererPath, 'utf8');

    const importMatches = [
      ...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm),
    ];
    expect(importMatches.length).toBeGreaterThanOrEqual(2);

    const allImportSpecifiers = importMatches.map((m) => m[2]);
    expect(allImportSpecifiers.sort()).toEqual(['./centennialTypes', 'react']);

    const runtimeImports = importMatches
      .filter((m) => !m[1].trimStart().startsWith('type '))
      .map((m) => m[2]);
    expect(runtimeImports).toEqual(['react']);

    // Zero dynamic imports, zero require(), zero runtime store/catalog/manifest imports
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(catalog|useAppStore|weaponManifest)/
    );

    // Keep module compact so combined `armory-silhouettes` chunk remains < 115 kB minified
    expect(Buffer.byteLength(source, 'utf8')).toBeLessThan(100_000);
  });
});

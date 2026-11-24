import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { WeaponNarrationBundle } from '../src/narration/types';
import type { CentennialWeaponBlueprint } from '../src/weapons/expansion/centennialTypes';
import { ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS } from '../src/weapons/expansion/catalog/archeryArmorOrdnance';
import { SHOTGUNS_AND_PISTOLS_BLUEPRINTS } from '../src/weapons/expansion/catalog/shotgunsAndPistols';
import { SMGS_AND_SNIPERS_BLUEPRINTS } from '../src/weapons/expansion/catalog/smgsAndSnipers';

const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATOR_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'generate_centennial_narrations.mjs'
);

interface CanonicalSlotSpec {
  slot: string;
  bomCode: string;
  group: string;
}

interface GenerationResult {
  dryRun: boolean;
  outDir: string;
  loadedModules: Array<{ file: string; count: number }>;
  count: number;
  totalParts: number;
  totalBytes: number;
  generated: Array<{
    id: string;
    orderIndex: number;
    outPath: string;
    partsCount: number;
    bytes: number;
  }>;
}

interface NarrationGeneratorModule {
  CANONICAL_20_PART_SLOTS: readonly CanonicalSlotSpec[];
  CJK_OR_FULLWIDTH_RE: RegExp;
  WP_JARGON_RE: RegExp;
  buildCentennialNarrationBundle: (
    bp: CentennialWeaponBlueprint
  ) => WeaponNarrationBundle;
  generateCentennialNarrations: (options?: {
    repoRoot?: string;
    outDir?: string;
    dryRun?: boolean;
    only?: Set<string> | null;
  }) => Promise<GenerationResult>;
}

const EXPECTED_TIMELINE_PRESET_KEYS = [
  'assembled',
  'field_strip',
  'sub_assembly',
  'full_exploded',
] as const;

const EXPECTED_FIRING_PHASE_KEYS = [
  'phase_1',
  'phase_2',
  'phase_3',
  'phase_4',
  'phase_5',
  'phase_6',
  'phase_7',
] as const;

describe('100-Weapon Expansion Phase 2F — Deterministic Bilingual Narration Generator', () => {
  let mod: NarrationGeneratorModule;

  beforeAll(async () => {
    mod = (await import(
      pathToFileURL(GENERATOR_SCRIPT_PATH).href
    )) as NarrationGeneratorModule;
  });

  const mergedBlueprints: readonly CentennialWeaponBlueprint[] = [
    ...SMGS_AND_SNIPERS_BLUEPRINTS,
    ...SHOTGUNS_AND_PISTOLS_BLUEPRINTS,
    ...ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS,
  ];

  function assertZeroCjkInEnglish(val: unknown, ctxPath: string): void {
    if (typeof val === 'string') {
      expect(
        mod.CJK_OR_FULLWIDTH_RE.test(val),
        `CJK/fullwidth character leak at ${ctxPath}: "${val}"`
      ).toBe(false);
      expect(
        mod.WP_JARGON_RE.test(val),
        `WP-XX leak at ${ctxPath}: "${val}"`
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
  }

  function assertZeroWpJargon(val: unknown, ctxPath: string): void {
    if (typeof val === 'string') {
      expect(
        mod.WP_JARGON_RE.test(val),
        `WP-XX leak at ${ctxPath}: "${val}"`
      ).toBe(false);
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => assertZeroWpJargon(item, `${ctxPath}[${idx}]`));
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        assertZeroWpJargon(v, `${ctxPath}.${k}`);
      }
    }
  }

  it('generates schema-valid 4-act + 20-part WeaponNarrationBundles for all 44 merged blueprints with 0 EN CJK, 0 WP-XX & audioUrl === ""', () => {
    expect(mergedBlueprints).toHaveLength(44);
    expect(mod.CANONICAL_20_PART_SLOTS).toHaveLength(20);

    for (const bp of mergedBlueprints) {
      const bundle = mod.buildCentennialNarrationBundle(bp);

      expect(bundle.schemaVersion).toBe(1);
      expect(bundle.weaponId).toBe(bp.id);
      expect(bundle.generatorModels).toEqual({
        text: 'centennial-blueprint-v1',
        storyTts: 'web-speech-api',
        partTts: 'web-speech-api',
      });

      // Strictly 0 EN CJK (incl. fullwidth punctuation) & 0 WP-XX
      assertZeroCjkInEnglish(bundle.uiMetaEn, `${bp.id}.uiMetaEn`);
      assertZeroCjkInEnglish(bundle.story.en, `${bp.id}.story.en`);
      assertZeroWpJargon(bundle.story.zh, `${bp.id}.story.zh`);

      // Required 4 timeline presets + 7 firing phases
      for (const presetKey of EXPECTED_TIMELINE_PRESET_KEYS) {
        const preset = bundle.uiMetaEn.timelinePresets[presetKey];
        expect(preset, `${bp.id} missing preset ${presetKey}`).toBeDefined();
        expect(preset.label.length).toBeGreaterThan(2);
        expect(preset.desc.length).toBeGreaterThan(15);
      }
      for (const phaseKey of EXPECTED_FIRING_PHASE_KEYS) {
        const ph = bundle.uiMetaEn.firingPhases[phaseKey];
        expect(ph, `${bp.id} missing firing phase ${phaseKey}`).toBeDefined();
        expect(ph.shortLabel.length).toBeGreaterThan(2);
        expect(ph.title.length).toBeGreaterThan(8);
        expect(ph.description.length).toBeGreaterThan(20);
      }

      // Canonical 20 part keys & BOM codes
      const partKeys = Object.keys(bundle.parts);
      expect(partKeys).toHaveLength(20);
      const partIdSet = new Set(partKeys);

      for (const { slot, bomCode } of mod.CANONICAL_20_PART_SLOTS) {
        const partId = `${bp.id}_${slot}`;
        const entry = bundle.parts[partId];
        expect(entry, `${bp.id} missing part ${partId}`).toBeDefined();
        expect(entry.partId).toBe(partId);
        expect(entry.bomCode).toBe(bomCode);
        expect(entry.calloutLabelEn.length).toBeGreaterThanOrEqual(3);
        expect(entry.calloutLabelEn.length).toBeLessThanOrEqual(32);

        assertZeroCjkInEnglish(
          entry.calloutLabelEn,
          `${bp.id}.parts.${partId}.calloutLabelEn`
        );
        assertZeroCjkInEnglish(entry.en, `${bp.id}.parts.${partId}.en`);
        assertZeroWpJargon(entry.zh, `${bp.id}.parts.${partId}.zh`);

        for (const lang of ['zh', 'en'] as const) {
          const loc = entry[lang];
          expect(loc.roleTag.length).toBeGreaterThan(2);
          expect(loc.overview.length).toBeGreaterThan(15);
          expect(loc.craftAndMaterial.length).toBeGreaterThan(15);
          expect(loc.kinematicRole.length).toBeGreaterThan(15);
          expect(loc.designHighlight.length).toBeGreaterThan(15);
          expect(loc.audioScript.length).toBeGreaterThan(25);
          expect(loc.audioUrl).toBe('');
        }
      }

      // 4 Acts, 3 Breakthroughs, >= 5 Milestones for both ZH & EN
      for (const lang of ['zh', 'en'] as const) {
        const story = bundle.story[lang];
        expect(story.headline.length).toBeGreaterThan(5);
        expect(story.deck.length).toBeGreaterThan(15);
        expect(story.acts).toHaveLength(4);
        expect(story.breakthroughs).toHaveLength(3);
        expect(story.milestones.length).toBeGreaterThanOrEqual(5);

        story.acts.forEach((act, idx) => {
          expect(act.id).toBe(`act${idx + 1}`);
          expect(act.paragraphs.length).toBeGreaterThanOrEqual(2);
          expect(act.audioScript.length).toBeGreaterThan(50);
          expect(act.audioUrl).toBe('');
          expect(act.focusPartId).toBeTruthy();
          expect(partIdSet.has(act.focusPartId!)).toBe(true);
        });

        for (const bt of story.breakthroughs) {
          expect(partIdSet.has(bt.focusPartId)).toBe(true);
          expect(bt.summary.length).toBeGreaterThan(15);
        }
      }
    }
  });

  it('supports standalone Node CLI --dry-run and --out-dir execution cleanly without touching public/narrations/', async () => {
    // 1. Standalone Node shell CLI dry-run
    const stdout = execFileSync(
      process.execPath,
      [GENERATOR_SCRIPT_PATH, '--dry-run', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const cliResult = JSON.parse(stdout) as GenerationResult;
    expect(cliResult.dryRun).toBe(true);
    expect(cliResult.count).toBeGreaterThanOrEqual(44);
    expect(cliResult.totalParts).toBe(cliResult.count * 20);

    // 2. Programmatic write to isolated temp dir
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'armory-centennial-narr-')
    );
    try {
      const writeRes = await mod.generateCentennialNarrations({
        outDir: tmpDir,
        only: new Set(['uzi', 'm200', 't90m', 'englishlongbow', 'm777']),
      });
      expect(writeRes.dryRun).toBe(false);
      expect(writeRes.count).toBe(5);
      expect(writeRes.totalParts).toBe(100);

      for (const id of ['uzi', 'm200', 't90m', 'englishlongbow', 'm777']) {
        const filePath = path.join(tmpDir, `${id}.json`);
        expect(fs.existsSync(filePath)).toBe(true);
        const parsed = JSON.parse(
          fs.readFileSync(filePath, 'utf8')
        ) as WeaponNarrationBundle;
        expect(parsed.weaponId).toBe(id);
        expect(Object.keys(parsed.parts)).toHaveLength(20);
        expect(parsed.story.en.acts[0].audioUrl).toBe('');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { CALIPER_V2_BENCHMARK_NOTES } from '../src/engine/caliper/caliperStore';
import {
  ENGINEERING_GLOSSARY_TERMS,
  getGlossaryTermsForWeapon,
} from '../src/engine/encyclopedia/engineeringGlossary';
import { EXAM_STRINGS } from '../src/engine/exam/examStrings';
import { ARMOR_PENETRATION_STRINGS } from '../src/features/armorlab/armorPenetrationStrings';
import { ARMORY_SORT_FILTER_STRINGS } from '../src/features/armory/armorySortFilter';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { CARTRIDGE_DUEL_STRINGS } from '../src/features/cartridges/cartridgeDuelMath';
import {
  RECOIL_EXHIBIT_PROFILES,
  RECOIL_LAB_STRINGS,
} from '../src/features/recoillab/recoilPhysics';
import {
  SCALE_WALL_EXHIBITS,
  SCALE_WALL_STRINGS,
} from '../src/features/scalewall/scaleWallSpecs';
import { SPLIT_SHOWDOWN_STRINGS } from '../src/features/showdown3d/splitShowdownStrings';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { EXHIBIT_DIRECTOR_PROFILES } from '../src/narration/storyDirector';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_CODE_RE = /\bWP-\d{2}[a-z]?\b/i;

/**
 * Only exact intentional language-switcher button labels that display "中文"
 * when toggling from English back to Chinese are exempt from the EN CJK gate.
 */
const INTENTIONAL_LANG_SWITCHER_KEYS = new Set([
  'langSwitchLabel',
  'langToggleZh',
  'langZh',
]);

interface CollectedString {
  path: string;
  value: string;
}

function collectStrings(
  node: unknown,
  prefix: string,
  out: CollectedString[] = [],
  seen = new Set<unknown>()
): CollectedString[] {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') {
    out.push({ path: prefix, value: node });
    return out;
  }
  if (typeof node !== 'object') return out;
  if (seen.has(node)) return out;
  seen.add(node);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      collectStrings(node[i], `${prefix}[${i}]`, out, seen);
    }
    return out;
  }

  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    collectStrings(val, `${prefix}.${key}`, out, seen);
  }
  return out;
}

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

describe('Permanent Repository-Wide Museum Quality Invariants Gate', () => {
  describe('1. Zero EN CJK Leak Gate Across All Bilingual Registries', () => {
    it('contains zero CJK characters across all 13 authoritative EN string & spec registries', () => {
      const enEntries: CollectedString[] = [
        ...collectStrings(UI_STRINGS.en, 'UI_STRINGS.en'),
        ...collectStrings(SHOWCASE_STRINGS.en, 'SHOWCASE_STRINGS.en'),
        ...collectStrings(
          ARMOR_PENETRATION_STRINGS.en,
          'ARMOR_PENETRATION_STRINGS.en'
        ),
        ...collectStrings(
          EXTERNAL_BALLISTICS_STRINGS.en,
          'EXTERNAL_BALLISTICS_STRINGS.en'
        ),
        ...collectStrings(
          SPLIT_SHOWDOWN_STRINGS.en,
          'SPLIT_SHOWDOWN_STRINGS.en'
        ),
        ...collectStrings(EXAM_STRINGS.en, 'EXAM_STRINGS.en'),
        ...collectStrings(SCALE_WALL_STRINGS.en, 'SCALE_WALL_STRINGS.en'),
        ...collectStrings(RECOIL_LAB_STRINGS.en, 'RECOIL_LAB_STRINGS.en'),
        ...collectStrings(
          ARMORY_SORT_FILTER_STRINGS.en,
          'ARMORY_SORT_FILTER_STRINGS.en'
        ),
        ...collectStrings(
          CARTRIDGE_DUEL_STRINGS.en,
          'CARTRIDGE_DUEL_STRINGS.en'
        ),
      ];

      for (const term of ENGINEERING_GLOSSARY_TERMS) {
        enEntries.push(
          { path: `ENGINEERING_GLOSSARY_TERMS.${term.id}.termEn`, value: term.termEn },
          {
            path: `ENGINEERING_GLOSSARY_TERMS.${term.id}.summaryEn`,
            value: term.summaryEn,
          }
        );
      }

      for (const [weaponId, spec] of Object.entries(WEAPON_RIFLING_SPECS)) {
        for (const [k, v] of Object.entries(spec as unknown as Record<string, unknown>)) {
          if (typeof v === 'string' && !k.endsWith('Zh')) {
            enEntries.push({ path: `WEAPON_RIFLING_SPECS.${weaponId}.${k}`, value: v });
          }
        }
      }

      for (const [weaponId, notes] of Object.entries(CALIPER_V2_BENCHMARK_NOTES)) {
        for (const note of notes) {
          enEntries.push({
            path: `CALIPER_V2_BENCHMARK_NOTES.${weaponId}.${note.kind}.labelEn`,
            value: note.labelEn,
          });
        }
      }

      expect(enEntries.length).toBeGreaterThan(400);

      const leaks = enEntries.filter(({ path: keyPath, value }) => {
        const leafKey = keyPath.split('.').pop() ?? '';
        if (INTENTIONAL_LANG_SWITCHER_KEYS.has(leafKey)) return false;
        return CJK_RE.test(value);
      });

      expect(leaks).toEqual([]);
    });
  });

  describe('2. Zero Public WP-XX Sprint ID Leak Gate (ZH & EN)', () => {
    it('contains zero internal WP-XX sprint codes across all exported ZH & EN user-facing copy registries', () => {
      const allCopyEntries: CollectedString[] = [
        ...collectStrings(UI_STRINGS, 'UI_STRINGS'),
        ...collectStrings(SHOWCASE_STRINGS, 'SHOWCASE_STRINGS'),
        ...collectStrings(ARMOR_PENETRATION_STRINGS, 'ARMOR_PENETRATION_STRINGS'),
        ...collectStrings(
          EXTERNAL_BALLISTICS_STRINGS,
          'EXTERNAL_BALLISTICS_STRINGS'
        ),
        ...collectStrings(SPLIT_SHOWDOWN_STRINGS, 'SPLIT_SHOWDOWN_STRINGS'),
        ...collectStrings(EXAM_STRINGS, 'EXAM_STRINGS'),
        ...collectStrings(SCALE_WALL_STRINGS, 'SCALE_WALL_STRINGS'),
        ...collectStrings(RECOIL_LAB_STRINGS, 'RECOIL_LAB_STRINGS'),
        ...collectStrings(
          ENGINEERING_GLOSSARY_TERMS,
          'ENGINEERING_GLOSSARY_TERMS'
        ),
        ...collectStrings(WEAPON_RIFLING_SPECS, 'WEAPON_RIFLING_SPECS'),
        ...collectStrings(
          CALIPER_V2_BENCHMARK_NOTES,
          'CALIPER_V2_BENCHMARK_NOTES'
        ),
        ...collectStrings(
          ARMORY_SORT_FILTER_STRINGS,
          'ARMORY_SORT_FILTER_STRINGS'
        ),
        ...collectStrings(CARTRIDGE_DUEL_STRINGS, 'CARTRIDGE_DUEL_STRINGS'),
      ];

      expect(allCopyEntries.length).toBeGreaterThan(800);

      const wpLeaks = allCopyEntries.filter(({ value }) => WP_CODE_RE.test(value));
      expect(wpLeaks).toEqual([]);
    });
  });

  describe('3. Complete 34/34 Exhibit Registry Parity Gate', () => {
    const canonicalIds = WEAPON_MANIFESTS.map((m) => m.id) as WeaponId[];
    const canonicalSet = new Set<string>(canonicalIds);

    it('covers exact 34/34 WeaponIds across manifests, rifling, recoil, caliper, director, scale wall & glossary', () => {
      expect(canonicalIds).toHaveLength(34);
      expect(canonicalSet.size).toBe(34);

      const assertKeySetParity = (label: string, keys: readonly string[]) => {
        expect(keys, `${label} count`).toHaveLength(34);
        const keySet = new Set(keys);
        expect(keySet.size, `${label} unique count`).toBe(34);
        for (const id of canonicalIds) {
          expect(keySet.has(id), `${label} missing ${id}`).toBe(true);
        }
      };

      assertKeySetParity('WEAPON_RIFLING_SPECS', Object.keys(WEAPON_RIFLING_SPECS));
      assertKeySetParity(
        'RECOIL_EXHIBIT_PROFILES',
        RECOIL_EXHIBIT_PROFILES.map((p) => p.weaponId)
      );
      assertKeySetParity(
        'CALIPER_V2_BENCHMARK_NOTES',
        Object.keys(CALIPER_V2_BENCHMARK_NOTES)
      );
      assertKeySetParity(
        'EXHIBIT_DIRECTOR_PROFILES',
        Object.keys(EXHIBIT_DIRECTOR_PROFILES)
      );
      assertKeySetParity(
        'SCALE_WALL_EXHIBITS',
        SCALE_WALL_EXHIBITS.map((e) => e.weaponId)
      );

      for (const id of canonicalIds) {
        const terms = getGlossaryTermsForWeapon(id);
        expect(
          terms.length,
          `getGlossaryTermsForWeapon(${id}) must return >= 2 principles`
        ).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('4. Zero Dangling Documentation Screenshots & Media Hygiene Gate', () => {
    it('verifies every docs/screenshots/* asset referenced in README.md and README.zh-CN.md exists non-empty', () => {
      for (const docFile of ['README.md', 'README.zh-CN.md']) {
        const markdown = fs.readFileSync(path.join(REPO_ROOT, docFile), 'utf-8');
        const matches = [
          ...new Set(
            [
              ...markdown.matchAll(
                /docs\/screenshots\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)/g
              ),
            ].map((m) => m[0])
          ),
        ];
        expect(matches.length, `${docFile} screenshot references`).toBeGreaterThan(10);

        const missingOrEmpty = matches.filter((rel) => {
          const full = path.join(REPO_ROOT, rel);
          return !fs.existsSync(full) || fs.statSync(full).size === 0;
        });
        expect(missingOrEmpty, `${docFile} dangling screenshots`).toEqual([]);
      }
    });

    it('enforces exact 414 WebP textures / 340 Cycles plates and strictly 0 rogue PNGs', () => {
      const textureFiles = walkFiles(path.join(REPO_ROOT, 'public', 'textures'));
      const plateFiles = walkFiles(path.join(REPO_ROOT, 'public', 'plates'));

      expect(textureFiles.filter((f) => f.endsWith('.webp'))).toHaveLength(414);
      expect(textureFiles.filter((f) => f.endsWith('.png'))).toHaveLength(0);

      expect(plateFiles.filter((f) => f.endsWith('.webp'))).toHaveLength(340);
      expect(plateFiles.filter((f) => f.endsWith('.png'))).toHaveLength(0);
    });
  });

  describe('5. Strict Lazy Modal Isolation & CI Workflow Hardening Gate', () => {
    const appSource = fs.readFileSync(path.join(REPO_ROOT, 'src', 'App.tsx'), 'utf-8');
    const ciYaml = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
      'utf-8'
    );

    const lazyModals = [
      'ScaleWallModal',
      'RecoilLabModal',
      'ArmorPenetrationModal',
      'HistoryTimelineModal',
      'CuratorTrailBar',
      'PosterShareModal',
      'DirectorReelModal',
      'OfflineMuseumModal',
      'ArmorerPassportModal',
      'MonographPrintModal',
      'TextureAtlasModal',
    ] as const;

    it('keeps all 11 heavy modals strictly React.lazy(...) in src/App.tsx with zero eager static imports', () => {
      for (const modalName of lazyModals) {
        const lazyRe = new RegExp(
          `const\\s+Lazy${modalName}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\([^)]*${modalName}['"]\\)`
        );
        expect(
          appSource,
          `${modalName} must be declared with React.lazy(...) in src/App.tsx`
        ).toMatch(lazyRe);

        const eagerImportRe = new RegExp(
          `^import\\s+.*\\b${modalName}\\b.*from\\s+`,
          'm'
        );
        expect(
          appSource,
          `${modalName} must NOT be eagerly statically imported in src/App.tsx`
        ).not.toMatch(eagerImportRe);
      }
    });

    it('hardens .github/workflows/ci.yml with zero-circular-chunk enforcement and /digital-armory-3d/ subpath build verification', () => {
      expect(ciYaml).toContain('npm run typecheck');
      expect(ciYaml).toContain('npm run lint');
      expect(ciYaml).toContain('npm test');
      expect(ciYaml).toContain('npm run assets:audit');
      expect(ciYaml).toContain('Circular chunk');
      expect(ciYaml).toContain('VITE_BASE_PATH=/digital-armory-3d/ npm run build');
      expect(ciYaml).toContain('/digital-armory-3d/assets/');
    });
  });
});

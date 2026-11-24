import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type AcousticTelemetryRoomId,
  getActiveAcousticTelemetry,
} from '../src/engine/audio/mechanicalSoundEngine';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { CALIPER_V2_BENCHMARK_NOTES } from '../src/engine/caliper/caliperStore';
import {
  ENGINEERING_GLOSSARY_TERMS,
  getGlossaryTermsForWeapon,
} from '../src/engine/encyclopedia/engineeringGlossary';
import { EXAM_STRINGS } from '../src/engine/exam/examStrings';
import {
  OFFLINE_MUSEUM_CACHE_NAME,
  OFFLINE_RUNTIME_CACHE_NAME,
} from '../src/engine/offline/offlineMuseumManager';
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
const ACOUSTIC_ROOMS: readonly AcousticTelemetryRoomId[] = [
  'bench_close',
  'indoor_range',
  'tactical_hall',
  'open_field',
];
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

      for (const manifest of WEAPON_MANIFESTS) {
        for (const room of ACOUSTIC_ROOMS) {
          const tel = getActiveAcousticTelemetry(manifest.id, room);
          enEntries.push(
            {
              path: `getActiveAcousticTelemetry.${manifest.id}.${room}.signatureLabelEn`,
              value: tel.signatureLabelEn,
            },
            {
              path: `getActiveAcousticTelemetry.${manifest.id}.${room}.caliberClassEn`,
              value: tel.caliberClassEn,
            },
            ...tel.highlightsEn.map((h, idx) => ({
              path: `getActiveAcousticTelemetry.${manifest.id}.${room}.highlightsEn[${idx}]`,
              value: h,
            }))
          );
        }
      }

      expect(enEntries.length).toBeGreaterThan(800);

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
        ...WEAPON_MANIFESTS.flatMap((manifest) =>
          ACOUSTIC_ROOMS.flatMap((room) =>
            collectStrings(
              getActiveAcousticTelemetry(manifest.id, room),
              `getActiveAcousticTelemetry.${manifest.id}.${room}`
            )
          )
        ),
      ];

      expect(allCopyEntries.length).toBeGreaterThan(1500);

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

      expect(ENGINEERING_GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(28);

      for (const id of canonicalIds) {
        const terms = getGlossaryTermsForWeapon(id);
        expect(
          terms.length,
          `getGlossaryTermsForWeapon(${id}) must return >= 2 principles`
        ).toBeGreaterThanOrEqual(2);

        for (const room of ACOUSTIC_ROOMS) {
          const tel = getActiveAcousticTelemetry(id, room);
          expect(tel.signatureId.trim().length, `${id}/${room} signatureId`).toBeGreaterThan(0);
          expect(tel.signatureLabelZh.trim().length, `${id}/${room} signatureLabelZh`).toBeGreaterThan(0);
          expect(tel.signatureLabelEn.trim().length, `${id}/${room} signatureLabelEn`).toBeGreaterThan(0);
          expect(tel.caliberClassZh.trim().length, `${id}/${room} caliberClassZh`).toBeGreaterThan(0);
          expect(tel.caliberClassEn.trim().length, `${id}/${room} caliberClassEn`).toBeGreaterThan(0);
          expect(tel.highlightsZh.length, `${id}/${room} highlightsZh`).toBeGreaterThanOrEqual(1);
          expect(tel.highlightsEn.length, `${id}/${room} highlightsEn`).toBeGreaterThanOrEqual(1);
          expect(Number.isFinite(tel.reverbRt60Sec) && tel.reverbRt60Sec > 0).toBe(true);
        }
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

  describe('6. 41/41 Flagship docs/screenshots/*.jpg On-Disk 1920×1080 JPEG Contract', () => {
    it('verifies all 41 FLAGSHIP_DOC_SHOTS exist non-empty on disk at exact 1920×1080 JPEG dimensions', async () => {
      const captureMod = (await import(
        pathToFileURL(
          path.join(REPO_ROOT, 'scripts', 'capture_flagship_docs_screenshots.mjs')
        ).href
      )) as {
        FLAGSHIP_DOC_SHOTS: ReadonlyArray<{
          id: string;
          filename: string;
          group: 'core' | 'sculptures' | 'labs';
        }>;
      };
      const visualGateMod = (await import(
        pathToFileURL(path.join(REPO_ROOT, 'scripts', 'qa_visual_gate.mjs')).href
      )) as {
        inspectImageDimensions: (
          buf: Buffer
        ) => { width: number; height: number } | null;
      };

      expect(captureMod.FLAGSHIP_DOC_SHOTS).toHaveLength(41);
      expect(
        captureMod.FLAGSHIP_DOC_SHOTS.filter((s) => s.group === 'core')
      ).toHaveLength(5);
      expect(
        captureMod.FLAGSHIP_DOC_SHOTS.filter((s) => s.group === 'sculptures')
      ).toHaveLength(25);
      expect(
        captureMod.FLAGSHIP_DOC_SHOTS.filter((s) => s.group === 'labs')
      ).toHaveLength(11);

      const screenshotsDir = path.join(REPO_ROOT, 'docs', 'screenshots');
      const failures: string[] = [];

      for (const shot of captureMod.FLAGSHIP_DOC_SHOTS) {
        const filePath = path.join(screenshotsDir, shot.filename);
        if (!fs.existsSync(filePath)) {
          failures.push(`${shot.filename}: missing`);
          continue;
        }
        const buf = fs.readFileSync(filePath);
        if (buf.length < 10_000) {
          failures.push(`${shot.filename}: suspiciously small (${buf.length} B)`);
          continue;
        }
        const dims = visualGateMod.inspectImageDimensions(buf);
        if (!dims || dims.width !== 1920 || dims.height !== 1080) {
          failures.push(
            `${shot.filename}: invalid dims ${dims ? `${dims.width}x${dims.height}` : 'null'}`
          );
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('7. 75-Target Complete App WCAG 2.1 AA Harness Lock', () => {
    it('enforces 6 screens + 14 modals + 5 HUDs = 25 surfaces × 3 profiles = 75 live WCAG checks', async () => {
      const a11yMod = (await import(
        pathToFileURL(path.join(REPO_ROOT, 'scripts', 'qa_a11y_audit.mjs')).href
      )) as {
        A11Y_SCREEN_SPECS: ReadonlyArray<{ key: string }>;
        A11Y_MODAL_SPECS: ReadonlyArray<{ key: string }>;
        A11Y_HUD_SPECS: ReadonlyArray<{ key: string }>;
        ALL_A11Y_TARGET_SPECS: ReadonlyArray<{ key: string }>;
        A11Y_PROFILES: Record<string, unknown>;
        buildA11yAuditTargets: (origin: string) => ReadonlyArray<{ id: string }>;
      };

      expect(a11yMod.A11Y_SCREEN_SPECS).toHaveLength(6);
      expect(a11yMod.A11Y_MODAL_SPECS).toHaveLength(14);
      expect(a11yMod.A11Y_HUD_SPECS).toHaveLength(5);
      expect(a11yMod.ALL_A11Y_TARGET_SPECS).toHaveLength(25);
      expect(Object.keys(a11yMod.A11Y_PROFILES)).toHaveLength(3);
      expect(a11yMod.buildA11yAuditTargets('http://127.0.0.1:4173')).toHaveLength(
        75
      );
    });
  });

  describe('8. PWA Manifest & Service Worker Parity Audit', () => {
    it('validates public/manifest.webmanifest 34-exhibit/10-hall metadata, subpath safety, icon files, and SW cache parity', () => {
      const manifestRaw = fs.readFileSync(
        path.join(REPO_ROOT, 'public', 'manifest.webmanifest'),
        'utf-8'
      );
      const manifest = JSON.parse(manifestRaw) as {
        id: string;
        name: string;
        short_name: string;
        description: string;
        start_url: string;
        scope: string;
        display: string;
        icons: Array<{ src: string; sizes: string; type: string }>;
        shortcuts: Array<{
          name: string;
          short_name: string;
          description: string;
          url: string;
        }>;
      };

      // Accurate 34-exhibit / 10-hall / 854-part counts & zero WP-XX / EN CJK leaks
      expect(manifest.name).toContain('34 Exhibits');
      expect(manifest.name).toContain('10 Halls');
      expect(manifest.description).toContain('34 Exhibits');
      expect(manifest.description).toContain('10 Halls');
      expect(manifest.description).toContain('854 Parts');
      expect(manifestRaw).not.toMatch(WP_CODE_RE);
      expect(manifestRaw).not.toMatch(CJK_RE);

      // Subpath-safe relative PWA roots for both `/` and `/digital-armory-3d/`
      expect(manifest.id.startsWith('./')).toBe(true);
      expect(manifest.start_url.startsWith('./')).toBe(true);
      expect(manifest.scope.startsWith('./')).toBe(true);
      expect(manifest.display).toBe('standalone');

      // Every declared icon exists non-empty inside public/
      expect(manifest.icons.length).toBeGreaterThanOrEqual(1);
      for (const icon of manifest.icons) {
        expect(icon.src.startsWith('./')).toBe(true);
        const iconPath = path.join(REPO_ROOT, 'public', icon.src.replace(/^\.\//, ''));
        expect(fs.existsSync(iconPath), `Missing manifest icon ${icon.src}`).toBe(true);
        expect(fs.statSync(iconPath).size).toBeGreaterThan(0);
      }

      // Every shortcut uses subpath-safe `./?` URL
      expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(4);
      for (const sc of manifest.shortcuts) {
        expect(sc.url.startsWith('./?')).toBe(true);
        expect(sc.name.trim().length).toBeGreaterThan(0);
        expect(sc.description.trim().length).toBeGreaterThan(0);
      }

      // Service worker cache version parity & bounded eviction hygiene
      const swSrc = fs.readFileSync(
        path.join(REPO_ROOT, 'public', 'sw.js'),
        'utf-8'
      );
      expect(swSrc).toContain(
        `const OFFLINE_CACHE_NAME = '${OFFLINE_MUSEUM_CACHE_NAME}'`
      );
      expect(swSrc).toContain(
        `const RUNTIME_CACHE_NAME = '${OFFLINE_RUNTIME_CACHE_NAME}'`
      );
      expect(swSrc).toContain('RUNTIME_CACHE_MAX_ENTRIES');
      expect(swSrc).toContain('status: 503');
    });
  });
});

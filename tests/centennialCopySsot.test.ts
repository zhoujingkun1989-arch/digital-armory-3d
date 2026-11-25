import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECOIL_LAB_STRINGS } from '../src/features/recoillab/recoilPhysics';
import { SCALE_WALL_STRINGS } from '../src/features/scalewall/scaleWallSpecs';
import { TIMELINE_STRINGS } from '../src/features/timeline/HistoryTimelineModal';
import { TIMELINE_ERAS } from '../src/features/timeline/historyTimelineSpecs';
import {
  KEYBOARD_POWER_TOOLS,
  KEYBOARD_SHORTCUT_GROUPS,
} from '../src/features/workbench/KeyboardShortcutsModal';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import {
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_TIMELINE_MAX_YEAR,
  MUSEUM_TIMELINE_MIN_YEAR,
  MUSEUM_TOTAL_PARTS,
} from '../src/weapons/museumMetrics';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_OR_FULLWIDTH_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

const STALE_TOTAL_EXHIBIT_RE =
  /\b34\s*(?:exhibits?|weapons?|firearms?)\b|\b34-bay\b|\b34\s*[×x]\s*33\b|\b34\/34\b|全馆\s*34\s*(?:款|展品)|搜索\s*34\s*款|直达\s*34\s*展品|三十四/i;
const STALE_TOTAL_PARTS_RE = /\b854\s*(?:parts?|moving parts|interactive 3d parts|个零件|零件)\b/i;
const STALE_TIMELINE_SPAN_RE = /1894[–-]2026|\b132-year\b|132\s*年/i;

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

describe('100-Weapon Expansion Phase 4A — SSOT Museum Copy & HTML/PWA Metadata Integrity', () => {
  it('eliminates stale 34-exhibit / 854-total-parts / 1894-2026 literals across index.html, showcase.html & public/manifest.webmanifest', () => {
    for (const relPath of [
      'index.html',
      'showcase.html',
      'public/manifest.webmanifest',
    ]) {
      const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

      expect(content, `${relPath} leaked stale 34-exhibit total`).not.toMatch(
        STALE_TOTAL_EXHIBIT_RE
      );
      expect(content, `${relPath} leaked stale 854-part total`).not.toMatch(
        STALE_TOTAL_PARTS_RE
      );
      expect(content, `${relPath} leaked stale 1894-2026 span`).not.toMatch(
        STALE_TIMELINE_SPAN_RE
      );
      expect(content, `${relPath} leaked WP-XX`).not.toMatch(WP_LEAK_RE);

      expect(content).toContain(`${MUSEUM_EXHIBIT_COUNT} Exhibits`);
      expect(content).toContain('10 Halls');
      expect(content).toContain(
        `${MUSEUM_TOTAL_PARTS.toLocaleString('en-US')} Parts`
      );
      expect(content).toContain(
        `${MUSEUM_TIMELINE_MIN_YEAR}–${MUSEUM_TIMELINE_MAX_YEAR}`
      );
      expect(content).toContain('34 Flagship Blender 5.2 Draco');
      expect(content).toContain('66 Centennial Procedural CAD');
    }

    const manifestRaw = fs.readFileSync(
      path.join(REPO_ROOT, 'public/manifest.webmanifest'),
      'utf8'
    );
    expect(CJK_OR_FULLWIDTH_RE.test(manifestRaw)).toBe(false);
    expect(manifestRaw).toContain('100-Bay 3D Vault');
    expect(manifestRaw).toContain('453 Packed ORM maps');
    expect(manifestRaw).toContain('1,980 Charon TTS + 100 bilingual narrations');
  });

  it('derives runtime UI, Showcase, Recoil Lab, Scale Wall, Timeline & Keyboard Shortcuts copy cleanly from 100-exhibit SSOT with 0 EN CJK & 0 WP-XX', () => {
    expect(MUSEUM_EXHIBIT_COUNT).toBe(100);
    expect(MUSEUM_TOTAL_PARTS).toBe(2174);
    expect(MUSEUM_TIMELINE_MIN_YEAR).toBe(1415);
    expect(MUSEUM_TIMELINE_MAX_YEAR).toBe(2026);

    // 1. UI_STRINGS (both ZH & EN) — zero stale 34-exhibit / 854-total-parts leaks outside explicit flagship atlas copy
    expect(UI_STRINGS.zh.workbench.scaleWallChipTitle).toContain('100 款');
    expect(UI_STRINGS.zh.workbench.scaleWallCmdSub).toContain('100 款');
    expect(UI_STRINGS.zh.workbench.recoilLabCmdSub).toContain('100 款');
    expect(UI_STRINGS.en.workbench.scaleWallChipTitle).toContain('100 exhibits');
    expect(UI_STRINGS.en.workbench.scaleWallCmdSub).toContain('100 firearms');
    expect(UI_STRINGS.en.workbench.recoilLabCmdSub).toContain('100 exhibits');
    expect(UI_STRINGS.zh.armory.subtitle).not.toContain('三十四');
    expect(UI_STRINGS.zh.armory.rackAria).not.toContain('三十四');
    expect(UI_STRINGS.zh.story.pendingDesc).toContain('2174');
    expect(UI_STRINGS.en.story.pendingDesc).toContain('2174');
    // Atlas switcher accurately specifies 34 Flagship baked ORM exhibits
    expect(UI_STRINGS.en.atlasModal.kicker).toBe(
      '34-FLAGSHIP 2K/4K PBR ATLAS'
    );
    expect(UI_STRINGS.zh.atlasModal.kicker).toBe(
      '34-FLAGSHIP 2K/4K PBR ATLAS'
    );

    // 2. SHOWCASE_STRINGS — zero stale 三十四
    const showcaseZh = flattenStrings(SHOWCASE_STRINGS.zh).join('\n');
    expect(showcaseZh).not.toContain('三十四');

    // 3. Recoil Lab & Scale Wall strings
    expect(RECOIL_LAB_STRINGS.zh.subtitle).toContain('100 款');
    expect(RECOIL_LAB_STRINGS.en.subtitle).toContain('all 100 exhibits');
    expect(SCALE_WALL_STRINGS.zh.title).toContain('100 款');
    expect(SCALE_WALL_STRINGS.en.title).toContain('100-Exhibit');
    expect(SCALE_WALL_STRINGS.zh.pickerHeading(3, 6)).toContain('100 款');
    expect(SCALE_WALL_STRINGS.en.pickerHeading(3, 6)).toContain(
      'All 100 Exhibits'
    );

    // 4. Timeline strings & eras (1415-2026, 611 years)
    expect(TIMELINE_STRINGS.zh.badge).toContain('1415–2026');
    expect(TIMELINE_STRINGS.zh.title).toContain('1415 – 2026');
    expect(TIMELINE_STRINGS.en.title).toContain('1415 - 2026');
    const allEra = TIMELINE_ERAS.find((e) => e.id === 'all');
    expect(allEra?.rangeLabel).toBe('1415–2026');
    expect(allEra?.summaryZh).toContain('611 年');
    expect(allEra?.summaryEn).toContain('611-year');

    // 5. Keyboard Shortcuts & Power Tools
    const cmdEntry = KEYBOARD_SHORTCUT_GROUPS.flatMap((g) => g.items).find(
      (i) => i.id === 'command-palette'
    );
    expect(cmdEntry?.labelZh).toContain('100 展品');
    expect(cmdEntry?.labelZh).toContain('2,174 零件');
    expect(cmdEntry?.labelEn).toContain('100 Exhibits, 2,174 Parts');

    const scaleWallTool = KEYBOARD_POWER_TOOLS.find(
      (t) => t.id === 'scale-wall'
    );
    expect(scaleWallTool?.labelZh).toContain('100 展品');
    expect(scaleWallTool?.labelEn).toContain('All 100 Exhibits');

    // 6. Source-level guard on modal aria-labels & all-clear badges
    for (const relPath of [
      'src/features/armory/MechanismShowdownModal.tsx',
      'src/features/passport/ArmorerPassportModal.tsx',
      'src/features/workbench/CommandPaletteModal.tsx',
      'src/features/workbench/KeyboardShortcutsModal.tsx',
      'src/features/recoillab/recoilPhysics.ts',
      'src/features/scalewall/scaleWallSpecs.ts',
      'src/features/timeline/HistoryTimelineModal.tsx',
      'src/features/timeline/historyTimelineSpecs.ts',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      expect(src, `${relPath} leaked stale 34-exhibit literal`).not.toMatch(
        STALE_TOTAL_EXHIBIT_RE
      );
      expect(src, `${relPath} leaked stale 854-part literal`).not.toMatch(
        STALE_TOTAL_PARTS_RE
      );
      expect(src, `${relPath} leaked stale 1894-2026 literal`).not.toMatch(
        STALE_TIMELINE_SPAN_RE
      );
    }

    // 7. Zero EN CJK / WP-XX across updated EN dictionaries
    for (const s of [
      ...flattenStrings(RECOIL_LAB_STRINGS.en),
      ...flattenStrings(SCALE_WALL_STRINGS.en),
      ...flattenStrings(TIMELINE_STRINGS.en),
      cmdEntry?.labelEn ?? '',
      scaleWallTool?.labelEn ?? '',
    ]) {
      expect(CJK_OR_FULLWIDTH_RE.test(s), `EN CJK leak: ${s}`).toBe(false);
      expect(WP_LEAK_RE.test(s), `WP leak: ${s}`).toBe(false);
    }
  });
});

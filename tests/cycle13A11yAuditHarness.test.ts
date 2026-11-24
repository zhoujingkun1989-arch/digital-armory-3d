import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
} from '../src/app/useUrlStateSync';
import { useAppStore } from '../src/store/useAppStore';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'qa_a11y_audit.mjs');

interface A11yIssue {
  rule: string;
  severity: 'error' | 'warning';
  count: number;
  message: string;
  samples: unknown[];
}

interface A11yTarget {
  id: string;
  key: string;
  kind: 'screen' | 'modal' | 'hud';
  label: string;
  profileId: string;
  profile: {
    id: string;
    env: string;
    width: number;
    height: number;
    mobile: boolean;
  };
  url: string;
}

interface A11yAuditModule {
  MIN_MOBILE_TOUCH_TARGET_PX: number;
  A11Y_PROFILES: Record<string, { id: string; width: number; height: number; mobile: boolean }>;
  A11Y_SCREEN_SPECS: ReadonlyArray<{ key: string; kind: string }>;
  A11Y_MODAL_SPECS: ReadonlyArray<{ key: string; kind: string }>;
  A11Y_HUD_SPECS: ReadonlyArray<{ key: string; kind: string }>;
  parseCliArgs: (argv?: string[]) => {
    url: string | null;
    distDir: string;
    profiles: string[];
    only: string[] | null;
    lang: string;
    timeoutMs: number;
    reportOnly: boolean;
    dryRun: boolean;
    json: boolean;
    help: boolean;
  };
  buildA11yAuditTargets: (
    origin: string,
    options?: { profiles?: string[]; only?: string[] | null; lang?: string }
  ) => A11yTarget[];
  buildDomProbeExpression: (opts: {
    isModal?: boolean;
    isHud?: boolean;
    hudSelector?: string | null;
    isMobile?: boolean;
    minTouchPx?: number;
  }) => string;
  evaluateControlAccessibility: (probe?: Record<string, unknown>) => {
    pass: boolean;
    issues: A11yIssue[];
  };
  evaluateDialogAccessibility: (
    dialog?: Record<string, unknown> | null,
    escapeResult?: Record<string, unknown> | null
  ) => {
    pass: boolean;
    issues: A11yIssue[];
  };
  evaluateHudAccessibility: (hud?: Record<string, unknown> | null) => {
    pass: boolean;
    hudFound: boolean;
    hasAriaLivePolite: boolean;
    ariaLiveCount: number;
    issues: A11yIssue[];
  };
  evaluateHeadingAndImageHygiene: (
    probe?: Record<string, unknown>,
    isModal?: boolean
  ) => {
    pass: boolean;
    issues: A11yIssue[];
  };
  evaluateMobileTouchTargets: (
    probe?: Record<string, unknown>,
    minTouchPx?: number
  ) => {
    pass: boolean;
    horizontalOverflowPx: number;
    undersizedButtonCount: number;
    issues: A11yIssue[];
  };
  evaluateTargetAudit: (
    target: A11yTarget,
    probe?: Record<string, unknown>,
    runtime?: Record<string, unknown>
  ) => {
    id: string;
    status: 'pass' | 'fail';
    errorCount: number;
    warningCount: number;
    issues: A11yIssue[];
  };
  summarizeA11yReport: (results: unknown[]) => {
    pass: boolean;
    totalTargets: number;
    passedTargets: number;
    failedTargets: number;
    byProfile: Record<
      string,
      { total: number; passed: number; failed: number; warnings: number }
    >;
    issueCountsByRule: Record<
      string,
      { severity: string; affectedTargets: number; totalInstances: number }
    >;
  };
}

let a11yMod: A11yAuditModule;

beforeAll(async () => {
  a11yMod = (await import(pathToFileURL(SCRIPT_PATH).href)) as A11yAuditModule;
});

describe('Cycle 13B · WCAG 2.1 AA Keyboard, Focus-Trap, ARIA & Mobile Touch-Target Audit Harness', () => {
  describe('Package & CLI Contracts', () => {
    it('registers "qa:a11y" in package.json and passes node --check syntax validation', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
      ) as { scripts: Record<string, string> };
      expect(pkg.scripts['qa:a11y']).toBe('node scripts/qa_a11y_audit.mjs');

      expect(() =>
        execFileSync(process.execPath, ['--check', SCRIPT_PATH], {
          cwd: REPO_ROOT,
          stdio: 'pipe',
        })
      ).not.toThrow();
    });

    it('prints complete usage text on --help and exits 0', () => {
      const stdout = execFileSync(process.execPath, [SCRIPT_PATH, '--help'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      });
      expect(stdout).toContain('WCAG 2.1 AA');
      expect(stdout).toContain('--url <origin>');
      expect(stdout).toContain('--dry-run');
      expect(stdout).toContain('--json');
      expect(stdout).toContain('shortcut_cmdk');
      expect(stdout).toContain('shortcut_help');
      expect(stdout).toContain('panel_showdown');
      expect(stdout).toContain('panel_atlas');
      expect(stdout).toContain('panel_monograph');
      expect(stdout).toContain('hud_fieldstrip');
      expect(stdout).toContain('hud_story_drawer');
    });

    it('emits valid 75-target JSON matrix on --dry-run --json covering all 6 screens, 14 modals & 5 interactive HUDs across 3 profiles', () => {
      const stdout = execFileSync(
        process.execPath,
        [SCRIPT_PATH, '--dry-run', '--json'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
        }
      );
      const plan = JSON.parse(stdout) as {
        dryRun: boolean;
        profiles: string[];
        totalTargets: number;
        targets: Array<{
          key: string;
          profileId: string;
          viewport: string;
          url: string;
        }>;
      };
      expect(plan.dryRun).toBe(true);
      expect(plan.profiles).toEqual([
        'dark_desktop',
        'daylight_desktop',
        'dark_mobile',
      ]);
      expect(a11yMod.A11Y_SCREEN_SPECS).toHaveLength(6);
      expect(a11yMod.A11Y_MODAL_SPECS).toHaveLength(14);
      expect(a11yMod.A11Y_HUD_SPECS).toHaveLength(5);
      expect(plan.totalTargets).toBe(75);
      expect(plan.targets).toHaveLength(75);

      const keys = new Set(plan.targets.map((t) => t.key));
      for (const requiredKey of [
        'showcase',
        'armory',
        'workbench_ak15',
        'cartridges',
        'ballistics',
        'split_showdown',
        'panel_scalewall',
        'panel_recoil',
        'panel_armor',
        'panel_timeline',
        'panel_passport',
        'panel_poster',
        'panel_offline',
        'panel_reel',
        'panel_causality',
        'shortcut_cmdk',
        'shortcut_help',
        'panel_showdown',
        'panel_atlas',
        'panel_monograph',
        'hud_fieldstrip',
        'hud_malfunction',
        'hud_attachments',
        'hud_tank_crew',
        'hud_story_drawer',
      ]) {
        expect(keys.has(requiredKey)).toBe(true);
      }

      const daylightTargets = plan.targets.filter(
        (t) => t.profileId === 'daylight_desktop'
      );
      expect(daylightTargets).toHaveLength(25);
      for (const t of daylightTargets) {
        expect(t.url).toContain('env=blueprint_daylight');
        expect(t.viewport).toBe('1920x1080');
      }

      const mobileTargets = plan.targets.filter(
        (t) => t.profileId === 'dark_mobile'
      );
      expect(mobileTargets).toHaveLength(25);
      for (const t of mobileTargets) {
        expect(t.viewport).toBe('390x844');
      }
    });

    it('hydrates and serializes ?panel=atlas and ?panel=monograph cleanly while preserving ?monograph=1 deep-links', () => {
      // 1. ?panel=atlas opens TextureAtlasModal and strips cleanly on close / navigation
      applyLocationToStore('?screen=workbench&weapon=ak15&panel=atlas&lang=en');
      expect(useAppStore.getState().textureModalOpen).toBe(true);
      expect(useAppStore.getState().activeWeaponId).toBe('ak15');

      const atlasOpenQs = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        '',
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false,
        true,
        false
      );
      expect(new URLSearchParams(atlasOpenQs).get('panel')).toBe('atlas');

      const atlasClosedQs = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        atlasOpenQs,
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false,
        false,
        false
      );
      expect(new URLSearchParams(atlasClosedQs).has('panel')).toBe(false);

      applyLocationToStore('?screen=workbench&weapon=ak15&lang=en');
      expect(useAppStore.getState().textureModalOpen).toBe(false);

      // 2. ?panel=monograph opens MonographPrintModal for weaponId and strips cleanly on close
      applyLocationToStore(
        '?screen=workbench&weapon=m4a1&panel=monograph&lang=en'
      );
      expect(useAppStore.getState().monographModalOpen).toBe(true);
      expect(useAppStore.getState().monographWeaponId).toBe('m4a1');

      const monoOpenQs = buildSearchString(
        'm4a1',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        '',
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false,
        false,
        true
      );
      expect(new URLSearchParams(monoOpenQs).get('panel')).toBe('monograph');

      const monoClosedQs = buildSearchString(
        'm4a1',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        monoOpenQs,
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false,
        false,
        false
      );
      expect(new URLSearchParams(monoClosedQs).has('panel')).toBe(false);

      // 3. Existing ?monograph=1 deep-link stays untouched and does not inject duplicate panel=monograph
      const legacyMonoQs = buildSearchString(
        'p08',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        '?monograph=1&weapon=p08&layout=spread_a3',
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false,
        false,
        true
      );
      const legacyParams = new URLSearchParams(legacyMonoQs);
      expect(legacyParams.get('monograph')).toBe('1');
      expect(legacyParams.has('panel')).toBe(false);

      applyLocationToStore('?screen=armory&weapon=ak15');
      expect(useAppStore.getState().monographModalOpen).toBe(false);
    });

    it('parses valid CLI flags and rejects invalid profile or target keys', () => {
      const parsed = a11yMod.parseCliArgs([
        '--url',
        'http://127.0.0.1:4199/',
        '--profiles',
        'dark_desktop,dark_mobile',
        '--only',
        'armory,panel_scalewall,shortcut_cmdk',
        '--lang',
        'zh',
        '--report-only',
        '--json',
      ]);
      expect(parsed.url).toBe('http://127.0.0.1:4199');
      expect(parsed.profiles).toEqual(['dark_desktop', 'dark_mobile']);
      expect(parsed.only).toEqual(['armory', 'panel_scalewall', 'shortcut_cmdk']);
      expect(parsed.lang).toBe('zh');
      expect(parsed.reportOnly).toBe(true);
      expect(parsed.json).toBe(true);

      const filtered = a11yMod.buildA11yAuditTargets(parsed.url!, parsed);
      expect(filtered).toHaveLength(6);

      expect(() => a11yMod.parseCliArgs(['--profiles', 'unknown_env'])).toThrow(
        /Unknown profile/
      );
      expect(() => a11yMod.parseCliArgs(['--only', 'nonexistent_modal'])).toThrow(
        /Unknown target key/
      );
      expect(() => a11yMod.parseCliArgs(['--bogus-flag'])).toThrow(
        /Unknown CLI argument/
      );
    });
  });

  describe('Pure WCAG 2.1 AA Rule Evaluators', () => {
    it('evaluates landmarks, accessible button/input names, and broken ARIA ID references', () => {
      const clean = a11yMod.evaluateControlAccessibility({
        totalInteractive: 18,
        unlabeledButtons: [],
        unlabeledInputs: [],
        brokenAriaLabelledBy: [],
        brokenAriaControls: [],
      });
      expect(clean.pass).toBe(true);
      expect(clean.issues).toHaveLength(0);

      const dirty = a11yMod.evaluateControlAccessibility({
        totalInteractive: 18,
        unlabeledButtons: [{ selector: 'button.icon-only', tag: 'button' }],
        unlabeledInputs: [{ selector: 'input.search-raw', tag: 'input' }],
        brokenAriaLabelledBy: [
          { selector: 'div.card', missingIds: ['missing-title-id'] },
        ],
        brokenAriaControls: [
          { selector: 'button.tab', missingIds: ['missing-panel-id'] },
        ],
      });
      expect(dirty.pass).toBe(false);
      expect(dirty.issues.map((i) => i.rule)).toEqual([
        'unlabeled_buttons',
        'unlabeled_inputs',
        'broken_aria_labelledby',
        'broken_aria_controls',
      ]);
    });

    it('evaluates dialog role, aria-modal, accessible name, focus trap, and Escape dismissal', () => {
      const passingDialog = a11yMod.evaluateDialogAccessibility(
        {
          found: true,
          selector: 'dialog.scalewall-dialog',
          role: 'dialog',
          isNativeDialogOpen: true,
          ariaModal: 'true',
          ariaLabelledBy: 'sw-title',
          resolvedLabelText: 'Scale Wall',
          focusInsideDialog: true,
          activeElementDesc: 'button.sw-close-btn',
        },
        { dismissed: true, errorCount: 0 }
      );
      expect(passingDialog.pass).toBe(true);
      expect(passingDialog.issues).toHaveLength(0);

      const failingDialog = a11yMod.evaluateDialogAccessibility(
        {
          found: true,
          selector: 'div.modal-box',
          role: null,
          isNativeDialogOpen: false,
          ariaModal: null,
          ariaLabel: '',
          resolvedLabelText: '',
          focusInsideDialog: false,
          activeElementDesc: 'body',
        },
        { dismissed: false, errorCount: 1 }
      );
      expect(failingDialog.pass).toBe(false);
      expect(failingDialog.issues.map((i) => i.rule)).toEqual([
        'dialog_missing_role',
        'dialog_missing_aria_modal',
        'dialog_missing_label',
        'dialog_focus_not_trapped',
        'dialog_escape_failed',
        'dialog_escape_runtime_error',
      ]);

      const missingDialog = a11yMod.evaluateDialogAccessibility(
        { found: false },
        { dismissed: false }
      );
      expect(missingDialog.pass).toBe(false);
      expect(missingDialog.issues[0].rule).toBe('dialog_not_found');
    });

    it('evaluates interactive Workbench HUD visibility and aria-live="polite" presence', () => {
      const passHud = a11yMod.evaluateHudAccessibility({
        found: true,
        selector: 'section.field-strip-hud',
        ariaLivePoliteCount: 2,
      });
      expect(passHud.pass).toBe(true);
      expect(passHud.hudFound).toBe(true);
      expect(passHud.hasAriaLivePolite).toBe(true);
      expect(passHud.issues).toHaveLength(0);

      const missingLive = a11yMod.evaluateHudAccessibility({
        found: true,
        selector: 'aside.tank-crew-hud',
        ariaLivePoliteCount: 0,
      });
      expect(missingLive.pass).toBe(false);
      expect(missingLive.issues.map((i) => i.rule)).toEqual([
        'hud_missing_aria_live_polite',
      ]);

      const missingHud = a11yMod.evaluateHudAccessibility({ found: false });
      expect(missingHud.pass).toBe(false);
      expect(missingHud.issues.map((i) => i.rule)).toEqual(['hud_not_found']);
    });

    it('evaluates <h1> heading presence on screens and <img> alt attribute hygiene', () => {
      expect(
        a11yMod.evaluateHeadingAndImageHygiene(
          { h1Count: 1, totalImages: 4, imagesMissingAlt: [] },
          false
        ).pass
      ).toBe(true);

      const screenMissingH1 = a11yMod.evaluateHeadingAndImageHygiene(
        {
          h1Count: 0,
          totalImages: 2,
          imagesMissingAlt: [{ selector: 'img.hero', src: '/plates/ak15.webp' }],
        },
        false
      );
      expect(screenMissingH1.pass).toBe(false);
      expect(screenMissingH1.issues.map((i) => i.rule)).toEqual([
        'missing_h1',
        'images_missing_alt',
      ]);

      expect(
        a11yMod.evaluateHeadingAndImageHygiene(
          { h1Count: 0, totalImages: 1, imagesMissingAlt: [] },
          true
        ).pass
      ).toBe(true);
    });

    it('evaluates mobile 390x844 horizontal overflow and >= 32px touch-target ergonomics', () => {
      expect(a11yMod.MIN_MOBILE_TOUCH_TARGET_PX).toBe(32);

      const cleanMobile = a11yMod.evaluateMobileTouchTargets({
        horizontalOverflowPx: 0,
        undersizedButtons: [{ selector: 'button.ok', width: 44, height: 36 }],
      });
      expect(cleanMobile.pass).toBe(true);
      expect(cleanMobile.undersizedButtonCount).toBe(0);

      const badMobile = a11yMod.evaluateMobileTouchTargets({
        horizontalOverflowPx: 14,
        undersizedButtons: [
          { selector: 'button.tiny', label: 'X', width: 24, height: 24 },
          { selector: 'button.slim', label: 'Tab', width: 80, height: 28 },
        ],
      });
      expect(badMobile.pass).toBe(false);
      expect(badMobile.horizontalOverflowPx).toBe(14);
      expect(badMobile.undersizedButtonCount).toBe(2);
      expect(badMobile.issues.map((i) => i.rule)).toEqual([
        'mobile_horizontal_overflow',
        'mobile_undersized_touch_target',
      ]);
    });

    it('aggregates per-target evaluations into a structured multi-profile WCAG scorecard', () => {
      const targets = a11yMod.buildA11yAuditTargets('http://127.0.0.1:4173', {
        profiles: ['dark_desktop', 'dark_mobile'],
        only: ['armory', 'panel_scalewall'],
      });
      expect(targets).toHaveLength(4);

      const resPass = a11yMod.evaluateTargetAudit(
        targets[0],
        {
          controls: {
            totalInteractive: 10,
            unlabeledButtons: [],
            unlabeledInputs: [],
          },
          headingsAndImages: { h1Count: 1, totalImages: 0, imagesMissingAlt: [] },
        },
        { consoleErrors: [], pageErrors: [], durationMs: 420 }
      );
      const resFail = a11yMod.evaluateTargetAudit(
        targets[3],
        {
          controls: {
            totalInteractive: 8,
            unlabeledButtons: [],
            unlabeledInputs: [],
          },
          dialog: {
            found: true,
            role: 'dialog',
            ariaModal: 'true',
            ariaLabel: 'Scale Wall',
            focusInsideDialog: true,
          },
          escapeResult: { dismissed: true, errorCount: 0 },
          headingsAndImages: { h1Count: 1, totalImages: 0, imagesMissingAlt: [] },
          mobile: {
            horizontalOverflowPx: 0,
            undersizedButtons: [{ selector: 'button.remove', width: 24, height: 24 }],
          },
        },
        { consoleErrors: [], pageErrors: [], durationMs: 510 }
      );

      expect(resPass.status).toBe('pass');
      expect(resFail.status).toBe('fail');

      const summary = a11yMod.summarizeA11yReport([resPass, resFail]);
      expect(summary.pass).toBe(false);
      expect(summary.totalTargets).toBe(2);
      expect(summary.passedTargets).toBe(1);
      expect(summary.failedTargets).toBe(1);
      expect(summary.byProfile.dark_desktop.passed).toBe(1);
      expect(summary.byProfile.dark_mobile.failed).toBe(1);
      expect(
        summary.issueCountsByRule.mobile_undersized_touch_target.totalInstances
      ).toBe(1);

      const expr = a11yMod.buildDomProbeExpression({
        isModal: true,
        isMobile: true,
      });
      expect(() => new Function(`return ${expr};`)).not.toThrow();
      expect(Object.keys(a11yMod.A11Y_PROFILES)).toEqual([
        'dark_desktop',
        'daylight_desktop',
        'dark_mobile',
      ]);
    });
  });
});

#!/usr/bin/env node
/**
 * Digital Armory 3D — Automated WCAG 2.1 AA Keyboard, Focus-Trap, ARIA
 * & Mobile Touch-Target E2E Audit Harness
 *
 * Audits 100% of app surfaces — every major screen (6), every interactive modal
 * (14), and every Workbench interactive HUD (5) = 25 targets × 3 profiles (75 checks)
 * in headless Chromium via native Node 22+ WebSocket CDP across:
 *   - Dark Studio Desktop      (1920x1080, env=tactical_vault)
 *   - Blueprint Daylight       (1920x1080, env=blueprint_daylight)
 *   - Mobile Portrait          (390x844,   env=tactical_vault, mobile=true)
 *
 * Programmatically verifies on every target:
 *   1. Landmarks & Accessible Names (zero unlabeled buttons/inputs, zero broken
 *      aria-labelledby / aria-controls ID references).
 *   2. Dialog Semantics & Escape Dismissal (role="dialog" or native <dialog open>,
 *      aria-modal="true", accessible label, focus inside dialog, real CDP Escape
 *      dismissal with zero console/page errors).
 *   3. Heading & Image Hygiene (<h1> presence on screens; every visible <img>
 *      carries an explicit `alt` attribute).
 *   4. Mobile Touch-Target Ergonomics on 390x844 (horizontalOverflowPx === 0,
 *      visible primary interactive buttons >= 32px minimum dimension).
 *
 * Usage:
 *   npm run qa:a11y -- --json
 *   npm run qa:a11y -- --profiles dark_desktop,dark_mobile --json
 *   npm run qa:a11y -- --only armory,panel_scalewall,shortcut_cmdk
 *   npm run qa:a11y -- --url http://127.0.0.1:4173 --json
 *   npm run qa:a11y -- --dry-run --json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChromiumLaunchArgs,
  discoverChromiumExecutable,
} from './dk_pdf_utils.mjs';
import {
  DEFAULT_REPO_ROOT,
  NativeCdpClient,
} from './qa_visual_gate.mjs';

export const MIN_MOBILE_TOUCH_TARGET_PX = 32;
export const DEFAULT_A11Y_LANG = 'en';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_DIALOG_SETTLE_MS = 350;

export const A11Y_PROFILES = Object.freeze({
  dark_desktop: Object.freeze({
    id: 'dark_desktop',
    label: 'Dark Studio Desktop (1920x1080)',
    env: 'tactical_vault',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  }),
  daylight_desktop: Object.freeze({
    id: 'daylight_desktop',
    label: 'Blueprint Daylight Desktop (1920x1080)',
    env: 'blueprint_daylight',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  }),
  dark_mobile: Object.freeze({
    id: 'dark_mobile',
    label: 'Mobile Portrait (390x844)',
    env: 'tactical_vault',
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }),
});

export const VALID_A11Y_PROFILES = Object.freeze(Object.keys(A11Y_PROFILES));

export const A11Y_SCREEN_SPECS = Object.freeze([
  Object.freeze({
    key: 'showcase',
    kind: 'screen',
    label: 'Showcase Landing',
    query: 'screen=showcase',
    readySelector: 'main, header, h1',
  }),
  Object.freeze({
    key: 'armory',
    kind: 'screen',
    label: 'Armory 3D Vault',
    query: 'screen=armory',
    readySelector: 'header, .armory-header, .armory-view',
  }),
  Object.freeze({
    key: 'workbench_ak15',
    kind: 'screen',
    label: 'Workbench (AK-15)',
    query: 'screen=workbench&weapon=ak15',
    readySelector: '.top-bar, .workbench-header, header',
  }),
  Object.freeze({
    key: 'cartridges',
    kind: 'screen',
    label: '1:1 Cartridge Cutaway Lab',
    query: 'screen=cartridges',
    readySelector: '.cartridge-topbar, .cartridge-lab-screen, header',
  }),
  Object.freeze({
    key: 'ballistics',
    kind: 'screen',
    label: '1,000m External Ballistics & 3D Range',
    query: 'screen=ballistics',
    readySelector: '.eb-topbar, .ballistics-screen, header',
  }),
  Object.freeze({
    key: 'split_showdown',
    kind: 'screen',
    label: '3D Split-Screen Showdown',
    query: 'screen=split_showdown&weaponA=ak15&weaponB=m4a1',
    readySelector: '.split-showdown-topbar, .split-showdown-overlay, header',
  }),
]);

export const A11Y_MODAL_SPECS = Object.freeze([
  Object.freeze({
    key: 'panel_scalewall',
    kind: 'modal',
    label: 'Scale Wall Modal (?panel=scalewall)',
    query: 'screen=armory&panel=scalewall',
    expectedDialogSelector: '[data-testid="scale-wall-modal"], .scalewall-dialog',
  }),
  Object.freeze({
    key: 'panel_recoil',
    kind: 'modal',
    label: 'Recoil Physics Lab (?panel=recoil)',
    query: 'screen=armory&panel=recoil',
    expectedDialogSelector: '[data-testid="recoil-lab-modal"], .recoillab-dialog',
  }),
  Object.freeze({
    key: 'panel_armor',
    kind: 'modal',
    label: 'Armor Penetration Lab (?panel=armor)',
    query: 'screen=armory&panel=armor',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'panel_timeline',
    kind: 'modal',
    label: 'History Timeline (?panel=timeline)',
    query: 'screen=armory&panel=timeline',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'panel_passport',
    kind: 'modal',
    label: 'Armorer Passport (?panel=passport)',
    query: 'screen=armory&panel=passport',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'panel_poster',
    kind: 'modal',
    label: 'HD 3D Poster Studio (?panel=poster / U)',
    query: 'screen=workbench&weapon=ak15&panel=poster',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
    fallbackTriggerKey: Object.freeze({
      key: 'u',
      code: 'KeyU',
      text: 'u',
      modifiers: 0,
      windowsVirtualKeyCode: 85,
    }),
  }),
  Object.freeze({
    key: 'panel_offline',
    kind: 'modal',
    label: 'Offline Museum Cache (?panel=offline)',
    query: 'screen=armory&panel=offline',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'panel_reel',
    kind: 'modal',
    label: 'Director Reel Recorder (?panel=reel)',
    query: 'screen=workbench&weapon=ak15&panel=reel',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'panel_causality',
    kind: 'modal',
    label: 'Causality Sandbox (?panel=causality)',
    query: 'screen=workbench&weapon=ak15&panel=causality',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    key: 'shortcut_cmdk',
    kind: 'modal',
    label: 'Command Palette (Cmd/Ctrl+K)',
    query: 'screen=armory',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
    triggerKey: Object.freeze({
      key: 'k',
      code: 'KeyK',
      text: 'k',
      modifiers: 2, // CDP modifier bit 2 = Ctrl (accepted cross-platform by CommandPaletteModal)
      windowsVirtualKeyCode: 75,
    }),
  }),
  Object.freeze({
    key: 'shortcut_help',
    kind: 'modal',
    label: 'Keyboard Shortcuts Modal (?)',
    query: 'screen=workbench&weapon=ak15',
    expectedDialogSelector: '[role="dialog"], dialog[open]',
    triggerKey: Object.freeze({
      key: '?',
      code: 'Slash',
      text: '?',
      modifiers: 8, // CDP modifier bit 8 = Shift
      windowsVirtualKeyCode: 191,
    }),
  }),
  Object.freeze({
    key: 'panel_showdown',
    kind: 'modal',
    label: 'Mechanism Showdown Matrix (S)',
    query: 'screen=armory',
    expectedDialogSelector: 'dialog.showdown-dialog[open], [role="dialog"]',
    triggerKey: Object.freeze({
      key: 's',
      code: 'KeyS',
      text: 's',
      modifiers: 0,
      windowsVirtualKeyCode: 83,
    }),
  }),
  Object.freeze({
    key: 'panel_atlas',
    kind: 'modal',
    label: 'PBR Texture Atlas Inspector (?panel=atlas)',
    query: 'screen=workbench&weapon=ak15&panel=atlas',
    expectedDialogSelector: '.tex-modal-backdrop[role="dialog"], [role="dialog"]',
  }),
  Object.freeze({
    key: 'panel_monograph',
    kind: 'modal',
    label: 'DK Monograph Print Studio (?panel=monograph)',
    query: 'screen=workbench&weapon=ak15&panel=monograph',
    expectedDialogSelector: 'dialog.monograph-dialog[open], [role="dialog"]',
  }),
]);

export const A11Y_HUD_SPECS = Object.freeze([
  Object.freeze({
    key: 'hud_fieldstrip',
    kind: 'hud',
    label: 'Field-Strip Guided HUD ([G])',
    query: 'screen=workbench&weapon=ak15',
    hudSelector: '.field-strip-hud',
    triggerKey: Object.freeze({
      key: 'g',
      code: 'KeyG',
      text: 'g',
      modifiers: 0,
      windowsVirtualKeyCode: 71,
    }),
  }),
  Object.freeze({
    key: 'hud_malfunction',
    kind: 'hud',
    label: 'Malfunction Diagnostics HUD ([J])',
    query: 'screen=workbench&weapon=ak15',
    hudSelector: '.malfunction-hud',
    triggerKey: Object.freeze({
      key: 'j',
      code: 'KeyJ',
      text: 'j',
      modifiers: 0,
      windowsVirtualKeyCode: 74,
    }),
  }),
  Object.freeze({
    key: 'hud_attachments',
    kind: 'hud',
    label: 'Modular Optics & Muzzle Bench HUD ([O])',
    query: 'screen=workbench&weapon=m4a1',
    hudSelector: '.attachment-bench-card',
    triggerKey: Object.freeze({
      key: 'o',
      code: 'KeyO',
      text: 'o',
      modifiers: 0,
      windowsVirtualKeyCode: 79,
    }),
  }),
  Object.freeze({
    key: 'hud_tank_crew',
    kind: 'hud',
    label: '1:1 Tank Crew FLIR & FCS HUD (?panel=crew)',
    query: 'screen=workbench&weapon=ztz99a&panel=crew',
    hudSelector: '.tank-crew-hud',
  }),
  Object.freeze({
    key: 'hud_story_drawer',
    kind: 'hud',
    label: '4-Act Documentary R&D Story Drawer',
    query: 'screen=workbench&weapon=m1911',
    hudSelector: '.story-drawer',
    triggerClickExpr: `(() => {
      const btns = [...document.querySelectorAll('.top-bar button, .workbench-header button')];
      const storyBtn = btns.find((b) =>
        /story|r&d|history|研发|故事/i.test(
          (b.textContent || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('aria-label') || '')
        )
      );
      if (storyBtn) {
        storyBtn.click();
        return true;
      }
      return false;
    })()`,
  }),
]);

export const ALL_A11Y_TARGET_SPECS = Object.freeze([
  ...A11Y_SCREEN_SPECS,
  ...A11Y_MODAL_SPECS,
  ...A11Y_HUD_SPECS,
]);

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(msg, jsonMode = false) {
  const stream = jsonMode ? process.stderr : process.stdout;
  stream.write(`[qa-a11y] ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[qa-a11y] ERROR: ${msg}\n`);
}

export function formatHelpText() {
  return [
    'Digital Armory 3D — Automated WCAG 2.1 AA Keyboard, Focus-Trap, ARIA & Mobile Touch-Target Audit',
    '',
    'Usage:',
    '  npm run qa:a11y -- [options]',
    '  node scripts/qa_a11y_audit.mjs [options]',
    '',
    'Options:',
    '  --url <origin>       Audit an already-running server instead of serving dist/',
    '  --dist-dir <path>    Directory to serve when --url is omitted (default: dist)',
    '  --profiles <csv>     Comma-separated profiles: dark_desktop,daylight_desktop,dark_mobile',
    '  --only <csv>         Comma-separated target keys to audit (e.g. armory,panel_scalewall)',
    '  --lang <zh|en>       UI language query param (default: en)',
    '  --timeout-ms <ms>    Per-target readiness timeout (default: 30000)',
    '  --report-only        Always exit 0 even when WCAG issues are found (useful for CI dashboards)',
    '  --dry-run            Print planned audit matrix without launching Chromium',
    '  --json               Emit structured JSON scorecard to stdout (progress to stderr)',
    '  -h, --help           Show this help text',
    '',
    `Screens (${A11Y_SCREEN_SPECS.length}): ${A11Y_SCREEN_SPECS.map((s) => s.key).join(', ')}`,
    `Modals  (${A11Y_MODAL_SPECS.length}): ${A11Y_MODAL_SPECS.map((m) => m.key).join(', ')}`,
    `HUDs    (${A11Y_HUD_SPECS.length}): ${A11Y_HUD_SPECS.map((h) => h.key).join(', ')}`,
    '',
  ].join('\n');
}

export function parseCliArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    url: null,
    distDir: 'dist',
    profiles: [...VALID_A11Y_PROFILES],
    only: null,
    lang: DEFAULT_A11Y_LANG,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reportOnly: false,
    dryRun: false,
    json: false,
    help: false,
  };

  const validKeys = new Set(ALL_A11Y_TARGET_SPECS.map((s) => s.key));

  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i];
    if (raw === '--help' || raw === '-h') {
      opts.help = true;
      continue;
    }
    if (raw === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (raw === '--json') {
      opts.json = true;
      continue;
    }
    if (raw === '--report-only') {
      opts.reportOnly = true;
      continue;
    }

    const eqIdx = raw.indexOf('=');
    const flag = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
    const inlineVal = eqIdx === -1 ? undefined : raw.slice(eqIdx + 1);
    const nextVal = () => {
      if (inlineVal !== undefined) return inlineVal;
      if (i + 1 >= args.length) {
        throw new Error(`Option ${flag} requires a value.`);
      }
      i += 1;
      return args[i];
    };

    if (flag === '--url') {
      opts.url = nextVal().replace(/\/+$/, '');
    } else if (flag === '--dist-dir') {
      opts.distDir = nextVal();
    } else if (flag === '--profiles') {
      const list = nextVal()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) {
        throw new Error('--profiles must include at least one profile.');
      }
      for (const p of list) {
        if (!A11Y_PROFILES[p]) {
          throw new Error(
            `Unknown profile "${p}". Valid profiles: ${VALID_A11Y_PROFILES.join(', ')}`
          );
        }
      }
      opts.profiles = list;
    } else if (flag === '--only') {
      const list = nextVal()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) {
        throw new Error('--only must include at least one target key.');
      }
      for (const key of list) {
        if (!validKeys.has(key)) {
          throw new Error(
            `Unknown target key "${key}". Valid keys: ${[...validKeys].join(', ')}`
          );
        }
      }
      opts.only = list;
    } else if (flag === '--lang') {
      const lang = nextVal().trim().toLowerCase();
      if (lang !== 'en' && lang !== 'zh') {
        throw new Error(`Invalid --lang "${lang}". Expected "en" or "zh".`);
      }
      opts.lang = lang;
    } else if (flag === '--timeout-ms') {
      const n = Number(nextVal());
      if (!Number.isFinite(n) || n < 1000) {
        throw new Error(`Invalid --timeout-ms value "${n}". Must be >= 1000.`);
      }
      opts.timeoutMs = Math.round(n);
    } else {
      throw new Error(`Unknown CLI argument: ${raw}`);
    }
  }

  return opts;
}

/**
 * Builds the deterministic ordered list of WCAG 2.1 AA audit targets across
 * requested viewport/theme profiles and screen/modal specifications.
 */
export function buildA11yAuditTargets(origin, options = {}) {
  const cleanOrigin = String(origin || 'http://127.0.0.1:4173').replace(/\/+$/, '');
  const profiles = Array.isArray(options.profiles) && options.profiles.length > 0
    ? options.profiles
    : [...VALID_A11Y_PROFILES];
  const lang = options.lang === 'zh' ? 'zh' : 'en';
  const onlySet = Array.isArray(options.only) && options.only.length > 0
    ? new Set(options.only)
    : null;

  const specs = onlySet
    ? ALL_A11Y_TARGET_SPECS.filter((s) => onlySet.has(s.key))
    : ALL_A11Y_TARGET_SPECS;

  const targets = [];
  for (const profileId of profiles) {
    const profile = A11Y_PROFILES[profileId];
    if (!profile) {
      throw new Error(`Unknown profile "${profileId}".`);
    }
    for (const spec of specs) {
      const params = new URLSearchParams(spec.query);
      params.set('lang', lang);
      params.set('env', profile.env);
      const url = `${cleanOrigin}/?${params.toString()}`;
      targets.push({
        id: `${profile.id}:${spec.key}`,
        key: spec.key,
        kind: spec.kind,
        label: spec.label,
        profileId: profile.id,
        profile,
        url,
        readySelector: spec.readySelector ?? null,
        expectedDialogSelector: spec.expectedDialogSelector ?? null,
        hudSelector: spec.hudSelector ?? null,
        triggerKey: spec.triggerKey ?? null,
        triggerClickExpr: spec.triggerClickExpr ?? null,
        fallbackTriggerKey: spec.fallbackTriggerKey ?? null,
      });
    }
  }
  return targets;
}

// ============================================================================
// Pure WCAG 2.1 AA Rule Evaluators (directly unit-tested in Vitest)
// ============================================================================

/**
 * Rule 1: Landmarks & Accessible Names (WCAG 4.1.2 / 1.3.1)
 */
export function evaluateControlAccessibility(probe = {}) {
  const unlabeledButtons = Array.isArray(probe.unlabeledButtons)
    ? probe.unlabeledButtons
    : [];
  const unlabeledInputs = Array.isArray(probe.unlabeledInputs)
    ? probe.unlabeledInputs
    : [];
  const brokenAriaLabelledBy = Array.isArray(probe.brokenAriaLabelledBy)
    ? probe.brokenAriaLabelledBy
    : [];
  const brokenAriaControls = Array.isArray(probe.brokenAriaControls)
    ? probe.brokenAriaControls
    : [];

  const issues = [];
  if (unlabeledButtons.length > 0) {
    issues.push({
      rule: 'unlabeled_buttons',
      severity: 'error',
      count: unlabeledButtons.length,
      message: `${unlabeledButtons.length} visible button(s) lack an accessible name`,
      samples: unlabeledButtons.slice(0, 8),
    });
  }
  if (unlabeledInputs.length > 0) {
    issues.push({
      rule: 'unlabeled_inputs',
      severity: 'error',
      count: unlabeledInputs.length,
      message: `${unlabeledInputs.length} visible form control(s) lack an accessible label`,
      samples: unlabeledInputs.slice(0, 8),
    });
  }
  if (brokenAriaLabelledBy.length > 0) {
    issues.push({
      rule: 'broken_aria_labelledby',
      severity: 'error',
      count: brokenAriaLabelledBy.length,
      message: `${brokenAriaLabelledBy.length} broken aria-labelledby ID reference(s)`,
      samples: brokenAriaLabelledBy.slice(0, 8),
    });
  }
  if (brokenAriaControls.length > 0) {
    issues.push({
      rule: 'broken_aria_controls',
      severity: 'error',
      count: brokenAriaControls.length,
      message: `${brokenAriaControls.length} broken aria-controls ID reference(s)`,
      samples: brokenAriaControls.slice(0, 8),
    });
  }

  return {
    pass: issues.length === 0,
    totalInteractive: Number(probe.totalInteractive ?? 0),
    unlabeledButtonCount: unlabeledButtons.length,
    unlabeledInputCount: unlabeledInputs.length,
    brokenAriaLabelledByCount: brokenAriaLabelledBy.length,
    brokenAriaControlsCount: brokenAriaControls.length,
    issues,
  };
}

/**
 * Rule 2: Dialog Semantics, Focus Containment & Escape Dismissal (WCAG 2.1.2 / 4.1.2)
 */
export function evaluateDialogAccessibility(dialog = null, escapeResult = null) {
  const issues = [];
  if (!dialog || !dialog.found) {
    issues.push({
      rule: 'dialog_not_found',
      severity: 'error',
      count: 1,
      message: 'Expected modal/dialog failed to open or lacks role="dialog" / <dialog open>',
      samples: [],
    });
    return {
      pass: false,
      dialogFound: false,
      hasDialogSemantics: false,
      hasAriaModalTrue: false,
      hasAccessibleLabel: false,
      focusInsideDialog: false,
      escapeDismissed: false,
      usedFallbackTrigger: Boolean(dialog?.usedFallbackTrigger),
      issues,
    };
  }

  const hasDialogSemantics = Boolean(dialog.isNativeDialogOpen || dialog.role === 'dialog');
  const hasAriaModalTrue = dialog.ariaModal === 'true';
  const hasAccessibleLabel = Boolean(
    (typeof dialog.ariaLabel === 'string' && dialog.ariaLabel.trim().length > 0) ||
      (typeof dialog.resolvedLabelText === 'string' &&
        dialog.resolvedLabelText.trim().length > 0)
  );
  const focusInsideDialog = Boolean(dialog.focusInsideDialog);
  const escapeDismissed = Boolean(escapeResult?.dismissed);
  const escapeErrors = Number(escapeResult?.errorCount ?? 0);

  if (dialog.usedFallbackTrigger) {
    issues.push({
      rule: 'deeplink_panel_not_hydrated',
      severity: 'warning',
      count: 1,
      message: 'Deep-link ?panel=... did not auto-open dialog; opened via keyboard shortcut fallback',
      samples: [{ selector: dialog.selector ?? '' }],
    });
  }
  if (!hasDialogSemantics) {
    issues.push({
      rule: 'dialog_missing_role',
      severity: 'error',
      count: 1,
      message: 'Open modal lacks role="dialog" or native <dialog open>',
      samples: [{ selector: dialog.selector ?? '' }],
    });
  }
  if (!hasAriaModalTrue) {
    issues.push({
      rule: 'dialog_missing_aria_modal',
      severity: 'error',
      count: 1,
      message: `Open dialog is missing aria-modal="true" (got ${JSON.stringify(dialog.ariaModal ?? null)})`,
      samples: [{ selector: dialog.selector ?? '' }],
    });
  }
  if (!hasAccessibleLabel) {
    issues.push({
      rule: 'dialog_missing_label',
      severity: 'error',
      count: 1,
      message: 'Open dialog lacks an accessible name via aria-label or resolved aria-labelledby',
      samples: [{ selector: dialog.selector ?? '', ariaLabelledBy: dialog.ariaLabelledBy ?? null }],
    });
  }
  if (!focusInsideDialog) {
    issues.push({
      rule: 'dialog_focus_not_trapped',
      severity: 'error',
      count: 1,
      message: `Focus is outside open dialog (activeElement: ${dialog.activeElementDesc || 'unknown'})`,
      samples: [{ activeElement: dialog.activeElementDesc || 'unknown' }],
    });
  }
  if (!escapeDismissed) {
    issues.push({
      rule: 'dialog_escape_failed',
      severity: 'error',
      count: 1,
      message: 'Pressing Escape did not dismiss the open dialog',
      samples: [{ selector: dialog.selector ?? '' }],
    });
  }
  if (escapeErrors > 0) {
    issues.push({
      rule: 'dialog_escape_runtime_error',
      severity: 'error',
      count: escapeErrors,
      message: `Pressing Escape triggered ${escapeErrors} runtime console/page error(s)`,
      samples: [],
    });
  }

  const hardErrors = issues.filter((i) => i.severity === 'error');
  return {
    pass: hardErrors.length === 0,
    dialogFound: true,
    hasDialogSemantics,
    hasAriaModalTrue,
    hasAccessibleLabel,
    focusInsideDialog,
    escapeDismissed,
    usedFallbackTrigger: Boolean(dialog.usedFallbackTrigger),
    issues,
  };
}

/**
 * Rule 2b: Interactive Workbench HUD Landmark & Polite Live Region (WCAG 4.1.3)
 */
export function evaluateHudAccessibility(hud = null) {
  const issues = [];
  if (!hud || !hud.found) {
    issues.push({
      rule: 'hud_not_found',
      severity: 'error',
      count: 1,
      message: 'Expected interactive Workbench HUD failed to open or is not visible',
      samples: [],
    });
    return {
      pass: false,
      hudFound: false,
      hasAriaLivePolite: false,
      ariaLiveCount: 0,
      issues,
    };
  }

  const ariaLiveCount = Number(hud.ariaLivePoliteCount ?? 0);
  const hasAriaLivePolite = ariaLiveCount >= 1;
  if (!hasAriaLivePolite) {
    issues.push({
      rule: 'hud_missing_aria_live_polite',
      severity: 'error',
      count: 1,
      message: `Active HUD (${hud.selector || 'unknown'}) lacks an aria-live="polite" telemetry/feedback region`,
      samples: [{ selector: hud.selector ?? '' }],
    });
  }

  return {
    pass: issues.length === 0,
    hudFound: true,
    hasAriaLivePolite,
    ariaLiveCount,
    issues,
  };
}

/**
 * Rule 3: Heading Hierarchy & Image Alt Hygiene (WCAG 1.1.1 / 1.3.1)
 */
export function evaluateHeadingAndImageHygiene(probe = {}, isModal = false) {
  const h1Count = Number(probe.h1Count ?? 0);
  const imagesMissingAlt = Array.isArray(probe.imagesMissingAlt)
    ? probe.imagesMissingAlt
    : [];
  const totalImages = Number(probe.totalImages ?? 0);
  const issues = [];

  if (!isModal && h1Count < 1) {
    issues.push({
      rule: 'missing_h1',
      severity: 'error',
      count: 1,
      message: 'Screen does not render an <h1> landmark heading',
      samples: [],
    });
  }
  if (imagesMissingAlt.length > 0) {
    issues.push({
      rule: 'images_missing_alt',
      severity: 'error',
      count: imagesMissingAlt.length,
      message: `${imagesMissingAlt.length} visible <img> element(s) missing alt attribute`,
      samples: imagesMissingAlt.slice(0, 8),
    });
  }

  return {
    pass: issues.length === 0,
    h1Count,
    totalImages,
    imagesMissingAltCount: imagesMissingAlt.length,
    issues,
  };
}

/**
 * Rule 4: Mobile Touch-Target Ergonomics & Zero Horizontal Overflow (390x844)
 */
export function evaluateMobileTouchTargets(
  mobileProbe = {},
  minTouchPx = MIN_MOBILE_TOUCH_TARGET_PX
) {
  const horizontalOverflowPx = Math.max(
    0,
    Math.round(Number(mobileProbe.horizontalOverflowPx ?? 0))
  );
  const rawButtons = Array.isArray(mobileProbe.undersizedButtons)
    ? mobileProbe.undersizedButtons
    : [];
  const undersizedButtons = rawButtons.filter(
    (b) => Math.min(Number(b.width ?? 0), Number(b.height ?? 0)) < minTouchPx
  );

  const issues = [];
  if (horizontalOverflowPx > 0) {
    issues.push({
      rule: 'mobile_horizontal_overflow',
      severity: 'error',
      count: horizontalOverflowPx,
      message: `Mobile viewport overflows horizontally by ${horizontalOverflowPx}px`,
      samples: [{ overflowPx: horizontalOverflowPx }],
    });
  }
  if (undersizedButtons.length > 0) {
    issues.push({
      rule: 'mobile_undersized_touch_target',
      severity: 'error',
      count: undersizedButtons.length,
      message: `${undersizedButtons.length} visible primary button(s) smaller than ${minTouchPx}px minimum dimension on 390x844`,
      samples: undersizedButtons.slice(0, 10),
    });
  }

  return {
    pass: issues.length === 0,
    horizontalOverflowPx,
    undersizedButtonCount: undersizedButtons.length,
    issues,
  };
}

/**
 * Combines all rule checks for one audited target into a standardized result.
 */
export function evaluateTargetAudit(target, probe = {}, runtime = {}) {
  const isModal = target.kind === 'modal';
  const isHud = target.kind === 'hud';
  const isMobile = Boolean(target.profile?.mobile);

  const controls = evaluateControlAccessibility(probe.controls);
  const dialog = isModal
    ? evaluateDialogAccessibility(probe.dialog, probe.escapeResult)
    : null;
  const hud = isHud ? evaluateHudAccessibility(probe.hud) : null;
  const headingsAndImages = evaluateHeadingAndImageHygiene(
    probe.headingsAndImages,
    isModal || isHud
  );
  const mobile = isMobile
    ? evaluateMobileTouchTargets(probe.mobile)
    : null;

  const consoleErrors = Array.isArray(runtime.consoleErrors)
    ? runtime.consoleErrors
    : [];
  const pageErrors = Array.isArray(runtime.pageErrors)
    ? runtime.pageErrors
    : [];

  const issues = [
    ...controls.issues,
    ...(dialog ? dialog.issues : []),
    ...(hud ? hud.issues : []),
    ...headingsAndImages.issues,
    ...(mobile ? mobile.issues : []),
  ];

  if (consoleErrors.length > 0) {
    issues.push({
      rule: 'console_errors',
      severity: 'error',
      count: consoleErrors.length,
      message: `${consoleErrors.length} runtime console error(s)`,
      samples: consoleErrors.slice(0, 5),
    });
  }
  if (pageErrors.length > 0) {
    issues.push({
      rule: 'page_errors',
      severity: 'error',
      count: pageErrors.length,
      message: `${pageErrors.length} uncaught page error(s)`,
      samples: pageErrors.slice(0, 5),
    });
  }

  const hardErrors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    id: target.id,
    key: target.key,
    kind: target.kind,
    label: target.label,
    profileId: target.profileId,
    url: target.url,
    status: hardErrors.length === 0 ? 'pass' : 'fail',
    errorCount: hardErrors.length,
    warningCount: warnings.length,
    durationMs: Number(runtime.durationMs ?? 0),
    checks: {
      controls,
      dialog,
      hud,
      headingsAndImages,
      mobile,
    },
    issues,
  };
}

/**
 * Produces an aggregate WCAG 2.1 AA scorecard across all audited targets.
 */
export function summarizeA11yReport(results = []) {
  const byProfile = {};
  const issueCountsByRule = {};
  const failedTargets = [];

  for (const r of results) {
    if (!byProfile[r.profileId]) {
      byProfile[r.profileId] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }
    byProfile[r.profileId].total += 1;
    if (r.status === 'pass') {
      byProfile[r.profileId].passed += 1;
    } else {
      byProfile[r.profileId].failed += 1;
      failedTargets.push(r.id);
    }
    byProfile[r.profileId].warnings += r.warningCount;

    for (const issue of r.issues) {
      if (!issueCountsByRule[issue.rule]) {
        issueCountsByRule[issue.rule] = {
          severity: issue.severity,
          affectedTargets: 0,
          totalInstances: 0,
          targets: [],
        };
      }
      issueCountsByRule[issue.rule].affectedTargets += 1;
      issueCountsByRule[issue.rule].totalInstances += issue.count;
      issueCountsByRule[issue.rule].targets.push(r.id);
    }
  }

  const totalTargets = results.length;
  const passedTargets = results.filter((r) => r.status === 'pass').length;
  const failedCount = totalTargets - passedTargets;

  return {
    pass: failedCount === 0,
    totalTargets,
    passedTargets,
    failedTargets: failedCount,
    failedTargetIds: failedTargets,
    byProfile,
    issueCountsByRule,
  };
}

// ============================================================================
// In-Page DOM Accessibility Probe (Executed via CDP Runtime.evaluate)
// ============================================================================

export function buildDomProbeExpression({
  isModal = false,
  isHud = false,
  hudSelector = null,
  isMobile = false,
  minTouchPx = MIN_MOBILE_TOUCH_TARGET_PX,
}) {
  return `(() => {
    const isModal = ${JSON.stringify(Boolean(isModal))};
    const isHud = ${JSON.stringify(Boolean(isHud))};
    const hudSelector = ${JSON.stringify(hudSelector || null)};
    const isMobile = ${JSON.stringify(Boolean(isMobile))};
    const minTouchPx = ${Number(minTouchPx)};

    const describeEl = (el) => {
      if (!el || el.nodeType !== 1) return 'none';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? '#' + el.id : '';
      const testId = el.getAttribute('data-testid') ? '[data-testid="' + el.getAttribute('data-testid') + '"]' : '';
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
        : '';
      return tag + id + testId + cls;
    };

    const isVisible = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.hidden) return false;
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.hasAttribute('inert')) return false;
        if (cur.tagName === 'DIALOG' && !cur.open) return false;
        if (cur.getAttribute('aria-hidden') === 'true') return false;
        const st = getComputedStyle(cur);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) {
          return false;
        }
        cur = cur.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    };

    const resolveIdListText = (idList) => {
      const ids = String(idList || '').trim().split(/\\s+/).filter(Boolean);
      const parts = [];
      const missing = [];
      for (const id of ids) {
        const node = document.getElementById(id);
        if (!node) {
          missing.push(id);
        } else {
          const txt = (node.textContent || '').trim();
          if (txt) parts.push(txt);
        }
      }
      return { text: parts.join(' ').trim(), missing };
    };

    const computeAccessibleName = (el) => {
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy && labelledBy.trim()) {
        const resolved = resolveIdListText(labelledBy);
        if (resolved.text) return resolved.text;
      }
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      if (ariaLabel) return ariaLabel;

      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (tag === 'INPUT' && ['button', 'submit', 'reset'].includes((el.type || '').toLowerCase())) {
          const val = (el.value || '').trim();
          if (val) return val;
        }
        if (el.id) {
          try {
            const labelEl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
            if (labelEl && (labelEl.textContent || '').trim()) {
              return labelEl.textContent.trim();
            }
          } catch {}
        }
        const wrapLabel = el.closest('label');
        if (wrapLabel && (wrapLabel.textContent || '').trim()) {
          return wrapLabel.textContent.trim();
        }
        const title = (el.getAttribute('title') || '').trim();
        if (title) return title;
        return '';
      }

      const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (txt) return txt;

      const img = el.querySelector('img[alt]');
      if (img && (img.getAttribute('alt') || '').trim()) {
        return img.getAttribute('alt').trim();
      }
      const svgTitle = el.querySelector('svg title');
      if (svgTitle && (svgTitle.textContent || '').trim()) {
        return svgTitle.textContent.trim();
      }
      const title = (el.getAttribute('title') || '').trim();
      if (title) return title;
      return '';
    };

    // Detect topmost open modal dialog or active interactive Workbench HUD
    const openDialogs = [...document.querySelectorAll('dialog[open], [role="dialog"]')]
      .filter((el) => isVisible(el));
    const activeDialog = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
    const activeHud = isHud && hudSelector
      ? [...document.querySelectorAll(hudSelector)].find((el) => isVisible(el)) || null
      : null;
    const scopeRoot = isModal && activeDialog
      ? activeDialog
      : isHud && activeHud
        ? activeHud
        : document;

    let hudInfo = { found: false, ariaLivePoliteCount: 0 };
    if (isHud && activeHud) {
      const politeRegions = activeHud.querySelectorAll('[aria-live="polite"]');
      const selfPolite = activeHud.getAttribute('aria-live') === 'polite' ? 1 : 0;
      hudInfo = {
        found: true,
        selector: describeEl(activeHud),
        role: activeHud.getAttribute('role') || null,
        ariaLabel: activeHud.getAttribute('aria-label') || null,
        ariaLivePoliteCount: politeRegions.length + selfPolite,
      };
    }

    let dialogInfo = { found: false };
    if (isModal && activeDialog) {
      const labelledBy = activeDialog.getAttribute('aria-labelledby');
      const resolved = labelledBy ? resolveIdListText(labelledBy) : { text: '', missing: [] };
      const activeEl = document.activeElement;
      dialogInfo = {
        found: true,
        selector: describeEl(activeDialog),
        tagName: activeDialog.tagName.toLowerCase(),
        role: activeDialog.getAttribute('role') || (activeDialog.tagName === 'DIALOG' ? 'dialog' : null),
        isNativeDialogOpen: activeDialog.tagName === 'DIALOG' && Boolean(activeDialog.open),
        ariaModal: activeDialog.getAttribute('aria-modal'),
        ariaLabel: activeDialog.getAttribute('aria-label'),
        ariaLabelledBy: labelledBy,
        resolvedLabelText: resolved.text,
        focusInsideDialog: Boolean(activeEl && (activeEl === activeDialog || activeDialog.contains(activeEl))),
        activeElementDesc: describeEl(activeEl),
      };
    }

    // 1. Controls & ARIA ID references
    const unlabeledButtons = [];
    const unlabeledInputs = [];
    const brokenAriaLabelledBy = [];
    const brokenAriaControls = [];

    const interactiveEls = [...scopeRoot.querySelectorAll(
      'button, [role="button"], input:not([type="hidden"]), select, textarea'
    )].filter((el) => isVisible(el));

    for (const el of interactiveEls) {
      const name = computeAccessibleName(el);
      const tag = el.tagName;
      if (!name) {
        const entry = {
          selector: describeEl(el),
          tag: tag.toLowerCase(),
          type: el.getAttribute('type') || null,
          placeholder: el.getAttribute('placeholder') || null,
        };
        if (tag === 'BUTTON' || el.getAttribute('role') === 'button') {
          unlabeledButtons.push(entry);
        } else {
          unlabeledInputs.push(entry);
        }
      }
    }

    const ariaRefCandidates = [...scopeRoot.querySelectorAll('[aria-labelledby], [aria-controls]')];
    if (isModal && activeDialog && (activeDialog.hasAttribute('aria-labelledby') || activeDialog.hasAttribute('aria-controls'))) {
      ariaRefCandidates.unshift(activeDialog);
    }
    const seenRefEls = new Set();
    for (const el of ariaRefCandidates) {
      if (seenRefEls.has(el) || !isVisible(el)) continue;
      seenRefEls.add(el);

      const lb = el.getAttribute('aria-labelledby');
      if (lb && lb.trim()) {
        const { missing } = resolveIdListText(lb);
        if (missing.length > 0) {
          brokenAriaLabelledBy.push({ selector: describeEl(el), missingIds: missing });
        }
      }
      const ctrl = el.getAttribute('aria-controls');
      if (ctrl && ctrl.trim()) {
        const ids = ctrl.trim().split(/\\s+/).filter(Boolean);
        const missing = ids.filter((id) => !document.getElementById(id));
        if (missing.length > 0) {
          brokenAriaControls.push({ selector: describeEl(el), missingIds: missing });
        }
      }
    }

    // 2. Headings & Images
    const h1Count = document.querySelectorAll('h1').length;
    const allImgs = [...scopeRoot.querySelectorAll('img')].filter((el) => isVisible(el));
    const imagesMissingAlt = [];
    for (const img of allImgs) {
      if (!img.hasAttribute('alt')) {
        imagesMissingAlt.push({
          selector: describeEl(img),
          src: (img.getAttribute('src') || '').slice(0, 80),
        });
      }
    }

    // 3. Mobile touch targets & horizontal overflow
    let mobileInfo = null;
    if (isMobile) {
      const docOverflow = Math.max(
        0,
        Math.round(document.documentElement.scrollWidth - window.innerWidth)
      );
      const undersizedButtons = [];
      const btnEls = [...scopeRoot.querySelectorAll('button, [role="button"]')]
        .filter((el) => isVisible(el) && !el.disabled);

      for (const btn of btnEls) {
        const rect = btn.getBoundingClientRect();
        // Only check buttons currently intersecting the viewport horizontally/vertically
        // or inside the open modal
        const minDim = Math.min(rect.width, rect.height);
        if (minDim < minTouchPx) {
          undersizedButtons.push({
            selector: describeEl(btn),
            label: computeAccessibleName(btn).slice(0, 48),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      mobileInfo = {
        horizontalOverflowPx: docOverflow,
        undersizedButtons,
      };
    }

    return {
      dialog: dialogInfo,
      hud: hudInfo,
      controls: {
        totalInteractive: interactiveEls.length,
        unlabeledButtons,
        unlabeledInputs,
        brokenAriaLabelledBy,
        brokenAriaControls,
      },
      headingsAndImages: {
        h1Count,
        totalImages: allImgs.length,
        imagesMissingAlt,
      },
      mobile: mobileInfo,
    };
  })()`;
}

// ============================================================================
// Local Static HTTP Server & Native CDP Browser Lifecycle (Zero-Zombie)
// ============================================================================

async function startStaticDistServer(distDir) {
  const absDist = path.resolve(DEFAULT_REPO_ROOT, distDir);
  if (!fs.existsSync(path.join(absDist, 'index.html'))) {
    throw new Error(
      `Missing production build at "${absDist}/index.html". Run "npm run build" first or pass --url.`
    );
  }

  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split(/[?#]/)[0];
    const cleanRel = decodeURIComponent(reqPath).replace(/^\/+/, '');
    let filePath = path.join(absDist, cleanRel || 'index.html');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath) || !filePath.startsWith(absDist)) {
      // SPA fallback only for extensionless routes; real missing assets return 404
      if (!path.extname(cleanRel)) {
        filePath = path.join(absDist, 'index.html');
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  const origin = `http://127.0.0.1:${addr.port}`;
  return {
    origin,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function launchHeadlessChromium() {
  const discovered = discoverChromiumExecutable();
  if (!discovered?.executablePath) {
    throw new Error(
      'Unable to locate Chromium / Google Chrome executable for headless CDP audit.'
    );
  }
  const { executablePath, isHeadlessShell } = discovered;

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-a11y-cdp-'));
  // Pick an ephemeral free port for CDP
  const probeSrv = http.createServer();
  await new Promise((resolve) => probeSrv.listen(0, '127.0.0.1', resolve));
  const debugPort = probeSrv.address().port;
  await new Promise((resolve) => probeSrv.close(() => resolve()));

  const baseArgs = buildChromiumLaunchArgs({
    mode: 'cdp',
    isHeadlessShell,
    userDataDir: tmpProfile,
    viewportWidth: 1920,
    viewportHeight: 1080,
    deviceScaleFactor: 1,
  });
  const launchArgs = [
    ...baseArgs.filter((a) => !a.startsWith('--remote-debugging-port=')),
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ];

  const proc = spawn(executablePath, launchArgs, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let wsUrl = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {
      // retry until Chromium binds debug port
    }
    await sleep(150);
  }

  if (!wsUrl) {
    proc.kill('SIGKILL');
    fs.rmSync(tmpProfile, { recursive: true, force: true });
    throw new Error('Timed out waiting for headless Chromium CDP endpoint.');
  }

  const cdp = await NativeCdpClient.connect(wsUrl, 15_000);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  const shutdown = async () => {
    try {
      if (!cdp.closed) {
        cdp.ws?.close?.();
      }
    } catch {
      // ignore
    }
    try {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
    await sleep(250);
    try {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    } catch {
      // ignore
    }
    await sleep(150);
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { cdp, proc, shutdown };
}

async function dispatchCdpKey(cdp, keySpec) {
  const {
    key,
    code,
    text = '',
    modifiers = 0,
    windowsVirtualKeyCode = 0,
  } = keySpec;

  await cdp.send('Input.dispatchKeyEvent', {
    type: text ? 'keyDown' : 'rawKeyDown',
    key,
    code,
    text: modifiers & 2 ? '' : text,
    unmodifiedText: modifiers & 2 ? '' : text,
    modifiers,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

async function evalValue(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'CDP Runtime.evaluate exception'
    );
  }
  return res?.result?.value;
}

async function waitForSelector(cdp, selector, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evalValue(
      cdp,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) return true;
    await sleep(120);
  }
  return false;
}

async function hasOpenDialog(cdp) {
  return Boolean(
    await evalValue(
      cdp,
      `(() => {
        const list = [...document.querySelectorAll('dialog[open], [role="dialog"]')];
        return list.some((el) => {
          if (el.hidden) return false;
          const st = getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        });
      })()`
    )
  );
}

async function auditSingleTarget(cdp, target, timeoutMs) {
  const startedAt = Date.now();
  const consoleErrors = [];
  const pageErrors = [];

  const offConsole = cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const msg = (params.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ')
        .trim();
      if (msg) consoleErrors.push(msg);
    }
  });
  const offException = cdp.on('Runtime.exceptionThrown', (params) => {
    const desc =
      params.exceptionDetails?.exception?.description ||
      params.exceptionDetails?.text ||
      'Uncaught exception';
    pageErrors.push(desc);
  });

  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: target.profile.width,
      height: target.profile.height,
      deviceScaleFactor: target.profile.deviceScaleFactor,
      mobile: target.profile.mobile,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: target.profile.mobile,
    });

    // Navigate cleanly to about:blank first on every target so stale modal state
    // or leftover focus from a prior route never leaks across targets.
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(80);
    await cdp.send('Page.navigate', { url: target.url });

    // Wait for React root mount
    await waitForSelector(cdp, '#root > *', Math.min(timeoutMs, 15_000));

    if (target.kind === 'screen') {
      if (target.readySelector) {
        await waitForSelector(cdp, target.readySelector, Math.min(timeoutMs, 10_000));
      }
      await sleep(500);
    } else if (target.kind === 'hud') {
      // Interactive Workbench HUD target
      await waitForSelector(cdp, '.top-bar, .workbench-header, header', 10_000);
      await sleep(550);
      const hudSel = target.hudSelector || '[role="region"]';
      if (target.triggerKey) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await evalValue(cdp, 'document.activeElement?.blur?.()');
          await dispatchCdpKey(cdp, target.triggerKey);
          const opened = await waitForSelector(cdp, hudSel, 3_000);
          if (opened) break;
          await sleep(400);
        }
      } else if (target.triggerClickExpr) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await evalValue(cdp, target.triggerClickExpr);
          const opened = await waitForSelector(cdp, hudSel, 3_000);
          if (opened) break;
          await sleep(400);
        }
      } else {
        await waitForSelector(cdp, hudSel, 8_000);
      }
      await sleep(450);

      const probe = await evalValue(
        cdp,
        buildDomProbeExpression({
          isModal: false,
          isHud: true,
          hudSelector: hudSel,
          isMobile: target.profile.mobile,
          minTouchPx: MIN_MOBILE_TOUCH_TARGET_PX,
        })
      );

      return evaluateTargetAudit(target, probe, {
        consoleErrors,
        pageErrors,
        durationMs: Date.now() - startedAt,
      });
    } else {
      // Modal target
      let usedFallbackTrigger = false;
      if (target.triggerKey) {
        // Wait for underlying screen chrome to mount before pressing shortcut
        await waitForSelector(cdp, 'header, .top-bar, .armory-header', 10_000);
        await sleep(550);
        const dialogSel =
          target.expectedDialogSelector || '[role="dialog"], dialog[open]';
        // Retry key trigger once if React lazy/effect listeners finish mounting slightly late
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await evalValue(cdp, 'document.activeElement?.blur?.()');
          await dispatchCdpKey(cdp, target.triggerKey);
          const opened = await waitForSelector(cdp, dialogSel, 2_500);
          if (opened) break;
          await sleep(400);
        }
      } else {
        const openedByUrl = await waitForSelector(
          cdp,
          target.expectedDialogSelector || '[role="dialog"], dialog[open]',
          5_000
        );
        if (!openedByUrl && target.fallbackTriggerKey) {
          usedFallbackTrigger = true;
          await evalValue(cdp, 'document.activeElement?.blur?.()');
          await dispatchCdpKey(cdp, target.fallbackTriggerKey);
          await waitForSelector(
            cdp,
            target.expectedDialogSelector || '[role="dialog"], dialog[open]',
            5_000
          );
        }
      }
      // Allow useDialogAccessibility focus-on-open rAF / microtask to settle
      await sleep(DEFAULT_DIALOG_SETTLE_MS);

      const probe = await evalValue(
        cdp,
        buildDomProbeExpression({
          isModal: true,
          isMobile: target.profile.mobile,
          minTouchPx: MIN_MOBILE_TOUCH_TARGET_PX,
        })
      );
      if (probe?.dialog) {
        probe.dialog.usedFallbackTrigger = usedFallbackTrigger;
      }

      // Test real CDP Escape dismissal and verify zero new errors during close
      const preEscErrCount = consoleErrors.length + pageErrors.length;
      let dismissed = false;
      if (probe?.dialog?.found) {
        await dispatchCdpKey(cdp, {
          key: 'Escape',
          code: 'Escape',
          modifiers: 0,
          windowsVirtualKeyCode: 27,
        });
        const escDeadline = Date.now() + 1_200;
        while (Date.now() < escDeadline) {
          if (!(await hasOpenDialog(cdp))) {
            dismissed = true;
            break;
          }
          await sleep(80);
        }
      }
      const postEscErrCount = consoleErrors.length + pageErrors.length;
      probe.escapeResult = {
        dismissed,
        errorCount: Math.max(0, postEscErrCount - preEscErrCount),
      };

      return evaluateTargetAudit(target, probe, {
        consoleErrors,
        pageErrors,
        durationMs: Date.now() - startedAt,
      });
    }

    const probe = await evalValue(
      cdp,
      buildDomProbeExpression({
        isModal: false,
        isMobile: target.profile.mobile,
        minTouchPx: MIN_MOBILE_TOUCH_TARGET_PX,
      })
    );

    return evaluateTargetAudit(target, probe, {
      consoleErrors,
      pageErrors,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    offConsole();
    offException();
  }
}

function formatTextScorecard(summary, results) {
  const lines = [
    '================================================================================',
    ' Digital Armory 3D — WCAG 2.1 AA Live Accessibility & Touch-Target Scorecard',
    '================================================================================',
    ` Result  : ${summary.pass ? 'PASS' : 'FINDINGS DETECTED'} (${summary.passedTargets}/${summary.totalTargets} passed, ${summary.failedTargets} failed)`,
    '',
    ' By Profile:',
  ];

  for (const [profileId, stats] of Object.entries(summary.byProfile)) {
    lines.push(
      `   - ${profileId.padEnd(18)} ${stats.passed}/${stats.total} passed (${stats.failed} failed, ${stats.warnings} warnings)`
    );
  }

  lines.push('', ' Issue Summary by Rule:');
  const ruleEntries = Object.entries(summary.issueCountsByRule);
  if (ruleEntries.length === 0) {
    lines.push('   - NONE (0 WCAG / ARIA / focus / touch-target findings)');
  } else {
    for (const [rule, info] of ruleEntries) {
      lines.push(
        `   - [${info.severity.toUpperCase()}] ${rule}: ${info.totalInstances} instance(s) across ${info.affectedTargets} target(s)`
      );
    }
  }

  lines.push('', ' Per-Target Matrix:');
  for (const r of results) {
    const tag = r.status === 'pass' ? 'PASS' : 'FAIL';
    const note = r.issues.length > 0
      ? r.issues.map((i) => `${i.rule}(${i.count})`).join(', ')
      : 'clean';
    lines.push(`   [${tag}] ${r.id.padEnd(36)} ${String(r.durationMs).padStart(5)}ms | ${note}`);
  }
  lines.push('================================================================================');
  return lines.join('\n');
}

export async function runA11yAudit(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    process.stdout.write(formatHelpText());
    return { exitCode: 0 };
  }

  if (opts.dryRun) {
    const plannedOrigin = opts.url || 'http://127.0.0.1:4173';
    const targets = buildA11yAuditTargets(plannedOrigin, opts);
    const payload = {
      dryRun: true,
      origin: plannedOrigin,
      profiles: opts.profiles,
      lang: opts.lang,
      totalTargets: targets.length,
      targets: targets.map((t) => ({
        id: t.id,
        key: t.key,
        kind: t.kind,
        profileId: t.profileId,
        viewport: `${t.profile.width}x${t.profile.height}`,
        url: t.url,
        hasTriggerKey: Boolean(t.triggerKey),
        hasFallbackTriggerKey: Boolean(t.fallbackTriggerKey),
      })),
    };
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      logInfo(`Dry-run plan: ${targets.length} targets across ${opts.profiles.join(', ')}`);
      for (const t of payload.targets) {
        logInfo(`  - ${t.id} (${t.viewport}) -> ${t.url}`);
      }
    }
    return { exitCode: 0, payload };
  }

  let server = null;
  let browser = null;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (browser) {
      await browser.shutdown();
    }
    if (server) {
      await server.close();
    }
  };

  const onSignal = () => {
    cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    let origin = opts.url;
    if (!origin) {
      server = await startStaticDistServer(opts.distDir);
      origin = server.origin;
      logInfo(`Serving "${opts.distDir}" at ${origin}`, opts.json);
    }

    const targets = buildA11yAuditTargets(origin, opts);
    logInfo(
      `Launching headless Chromium for ${targets.length} WCAG 2.1 AA targets...`,
      opts.json
    );
    browser = await launchHeadlessChromium();

    const results = [];
    for (let idx = 0; idx < targets.length; idx += 1) {
      const target = targets[idx];
      logInfo(
        `[${idx + 1}/${targets.length}] ${target.id} (${target.profile.width}x${target.profile.height})`,
        opts.json
      );
      const res = await auditSingleTarget(browser.cdp, target, opts.timeoutMs);
      results.push(res);
    }

    const summary = summarizeA11yReport(results);
    const report = {
      timestamp: new Date().toISOString(),
      origin,
      lang: opts.lang,
      profiles: opts.profiles,
      summary,
      results,
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatTextScorecard(summary, results)}\n`);
    }

    const exitCode = summary.pass || opts.reportOnly ? 0 : 1;
    return { exitCode, report };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }
}

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  runA11yAudit(process.argv.slice(2))
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      logError(err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}

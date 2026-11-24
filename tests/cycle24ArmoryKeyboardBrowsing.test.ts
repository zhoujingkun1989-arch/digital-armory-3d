import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArmoryView,
  formatArmoryExhibitAnnouncement,
  resolveNextArmoryExhibitIndex,
  shouldIgnoreArmoryArrowKeyEvent,
} from '../src/features/armory/ArmoryView';
import {
  KEYBOARD_SHORTCUT_GROUPS,
  KeyboardShortcutsModal,
} from '../src/features/workbench/KeyboardShortcutsModal';
import { useAppStore } from '../src/store/useAppStore';
import { ARMORY_WEAPONS } from '../src/weapons/manifests';

const CJK_RE = /[\u4e00-\u9fff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

afterEach(() => {
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 24A — Armory 3D Vault Arrow-Key Bay Navigation, Polite Announcer & Shortcuts Parity', () => {
  it('resolves next/previous Armory exhibit indices with clean wrap-around, single-item & empty-list safety', () => {
    const total = ARMORY_WEAPONS.length;
    expect(total).toBeGreaterThanOrEqual(34);

    // Mid-list stepping
    expect(resolveNextArmoryExhibitIndex(3, total, 1)).toBe(4);
    expect(resolveNextArmoryExhibitIndex(3, total, -1)).toBe(2);

    // Clean wrap-around at both ends
    expect(resolveNextArmoryExhibitIndex(total - 1, total, 1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(0, total, -1)).toBe(total - 1);

    // Full forward and backward round-trips cover every bay without NaN or OOB
    let cursor = 0;
    for (let step = 0; step < total; step++) {
      cursor = resolveNextArmoryExhibitIndex(cursor, total, 1);
      expect(Number.isInteger(cursor)).toBe(true);
      expect(cursor).toBeGreaterThanOrEqual(0);
      expect(cursor).toBeLessThan(total);
    }
    expect(cursor).toBe(0);

    for (let step = 0; step < total; step++) {
      cursor = resolveNextArmoryExhibitIndex(cursor, total, -1);
      expect(Number.isInteger(cursor)).toBe(true);
      expect(cursor).toBeGreaterThanOrEqual(0);
      expect(cursor).toBeLessThan(total);
    }
    expect(cursor).toBe(0);

    // Single-item filtered rack
    expect(resolveNextArmoryExhibitIndex(0, 1, 1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(0, 1, -1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(-1, 1, 1)).toBe(0);

    // Empty / invalid totals never throw or return NaN
    expect(resolveNextArmoryExhibitIndex(0, 0, 1)).toBe(-1);
    expect(resolveNextArmoryExhibitIndex(0, 0, -1)).toBe(-1);
    expect(resolveNextArmoryExhibitIndex(0, -4, 1)).toBe(-1);
    expect(resolveNextArmoryExhibitIndex(0, Number.NaN, 1)).toBe(-1);
    expect(resolveNextArmoryExhibitIndex(0, Number.POSITIVE_INFINITY, 1)).toBe(
      -1
    );

    // Active exhibit filtered out (currentIndex === -1) or out-of-range/NaN
    expect(resolveNextArmoryExhibitIndex(-1, total, 1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(-1, total, -1)).toBe(total - 1);
    expect(resolveNextArmoryExhibitIndex(999, total, 1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(999, total, -1)).toBe(total - 1);
    expect(resolveNextArmoryExhibitIndex(Number.NaN, total, 1)).toBe(0);
    expect(resolveNextArmoryExhibitIndex(Number.NaN, total, -1)).toBe(
      total - 1
    );
  });

  it('guards ArrowLeft/ArrowRight against open dialogs, modifiers, text inputs, contenteditable & slider/combobox roles', () => {
    // Plain ArrowLeft / ArrowRight on non-input targets are accepted
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowRight',
        targetTagName: 'BODY',
        hasOpenDialog: false,
      })
    ).toBe(false);
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowLeft',
        targetTagName: 'DIV',
        targetRole: 'button',
        hasOpenDialog: false,
      })
    ).toBe(false);
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowRight',
        targetTagName: 'BUTTON',
        hasOpenDialog: false,
      })
    ).toBe(false);

    // Non-arrow keys ignored
    for (const k of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'c']) {
      expect(shouldIgnoreArmoryArrowKeyEvent({ key: k })).toBe(true);
    }

    // Modifier combos ignored
    expect(
      shouldIgnoreArmoryArrowKeyEvent({ key: 'ArrowRight', ctrlKey: true })
    ).toBe(true);
    expect(
      shouldIgnoreArmoryArrowKeyEvent({ key: 'ArrowLeft', metaKey: true })
    ).toBe(true);
    expect(
      shouldIgnoreArmoryArrowKeyEvent({ key: 'ArrowRight', altKey: true })
    ).toBe(true);

    // Open modal/drawer/popover ignored
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowRight',
        hasOpenDialog: true,
      })
    ).toBe(true);

    // Form controls & contenteditable ignored
    for (const tag of ['INPUT', 'input', 'TEXTAREA', 'SELECT']) {
      expect(
        shouldIgnoreArmoryArrowKeyEvent({
          key: 'ArrowLeft',
          targetTagName: tag,
        })
      ).toBe(true);
    }
    expect(
      shouldIgnoreArmoryArrowKeyEvent({
        key: 'ArrowRight',
        targetTagName: 'DIV',
        targetIsContentEditable: true,
      })
    ).toBe(true);

    // Interactive ARIA widgets that own left/right arrows ignored
    for (const role of [
      'slider',
      'spinbutton',
      'textbox',
      'combobox',
      'listbox',
    ]) {
      expect(
        shouldIgnoreArmoryArrowKeyEvent({
          key: 'ArrowRight',
          targetTagName: 'DIV',
          targetRole: role,
        })
      ).toBe(true);
    }
  });

  it('formats bilingual polite screen-reader announcements cleanly with zero EN CJK', () => {
    const en = formatArmoryExhibitAnnouncement(3, 34, 'Glock 17 Gen5', 'en');
    expect(en).toBe('Bay 4 of 34 · Glock 17 Gen5');
    expect(CJK_RE.test(en)).toBe(false);

    const zh = formatArmoryExhibitAnnouncement(3, 34, '格洛克 17 Gen5', 'zh');
    expect(zh).toBe('第 4 / 34 号展位 · 格洛克 17 Gen5');

    // Invalid bounds return empty string
    expect(formatArmoryExhibitAnnouncement(-1, 34, 'AK-15', 'en')).toBe('');
    expect(formatArmoryExhibitAnnouncement(0, 0, 'AK-15', 'en')).toBe('');
    expect(formatArmoryExhibitAnnouncement(Number.NaN, 34, 'AK-15', 'en')).toBe(
      ''
    );
  });

  it('renders polite aria-live exhibit announcer, (←)/(→) rail chevron hints, data-weapon-id hooks & reduced-motion modal guards in ArmoryView', () => {
    const htmlEn = renderToStaticMarkup(
      React.createElement(ArmoryView, {
        weaponIdOverride: 'g17',
        langOverride: 'en',
      })
    );
    expect(htmlEn).toContain('data-testid="armory-exhibit-announcer"');
    expect(htmlEn).toContain('role="status"');
    expect(htmlEn).toContain('aria-live="polite"');
    expect(htmlEn).toContain('aria-atomic="true"');

    // Prev / Next rack scroll chevron buttons advertise (←) / (→) hints with 0 EN CJK
    expect(htmlEn).toContain('data-testid="armory-rack-prev-btn"');
    expect(htmlEn).toContain('data-testid="armory-rack-next-btn"');
    expect(htmlEn).toContain('aria-label="Scroll rack left (←)"');
    expect(htmlEn).toContain('aria-label="Scroll rack right (→)"');
    expect(htmlEn).toContain('title="Scroll rack left (←)"');
    expect(htmlEn).toContain('title="Scroll rack right (→)"');
    expect(htmlEn).toContain('data-weapon-id="g17"');

    // Verify EN prev/next hints have zero CJK
    const prevBtnMatch = htmlEn.match(
      /<button[^>]*data-testid="armory-rack-prev-btn"[^>]*>/
    );
    const nextBtnMatch = htmlEn.match(
      /<button[^>]*data-testid="armory-rack-next-btn"[^>]*>/
    );
    expect(prevBtnMatch).not.toBeNull();
    expect(nextBtnMatch).not.toBeNull();
    expect(CJK_RE.test(prevBtnMatch![0])).toBe(false);
    expect(CJK_RE.test(nextBtnMatch![0])).toBe(false);

    // ZH rail chevron hints
    const htmlZh = renderToStaticMarkup(
      React.createElement(ArmoryView, {
        weaponIdOverride: 'g17',
        langOverride: 'zh',
      })
    );
    expect(htmlZh).toContain('data-testid="armory-exhibit-announcer"');
    expect(htmlZh).toContain('aria-label="向左滚动查看槽位 (←)"');
    expect(htmlZh).toContain('aria-label="向右滚动查看槽位 (→)"');

    // Source-level verification of dialog guard, mechanical foley & reduced-motion smooth scroll
    const armorySrc = readFileSync(
      resolve(__dirname, '../src/features/armory/ArmoryView.tsx'),
      'utf8'
    );
    expect(armorySrc).toContain(
      `document.querySelector('[role="dialog"], dialog[open]')`
    );
    expect(armorySrc).toContain(`prefers-reduced-motion: reduce`);
    expect(armorySrc).toContain(`playWorkbenchFoley('part_select')`);
    expect(armorySrc).toContain(`scrollIntoView`);
  });

  it('documents ← / → Armory Vault browsing in KeyboardShortcutsModal with full bilingual parity, 0 EN CJK & 0 WP-XX', () => {
    const navGroup = KEYBOARD_SHORTCUT_GROUPS.find(
      (g) => g.id === 'navigation'
    );
    expect(navGroup).toBeDefined();

    const arrowEntry = navGroup!.items.find(
      (item) => item.id === 'armory-arrow-nav'
    );
    expect(arrowEntry).toBeDefined();
    expect(arrowEntry!.keys).toEqual(['← / →']);
    expect(arrowEntry!.labelEn).toBe('Browse Armory Vault exhibits');
    expect(arrowEntry!.labelZh).toBe('在 3D 展馆中左右切换展品');
    expect(CJK_RE.test(arrowEntry!.labelEn)).toBe(false);
    expect(WP_LEAK_RE.test(arrowEntry!.labelEn)).toBe(false);
    expect(WP_LEAK_RE.test(arrowEntry!.labelZh)).toBe(false);

    const htmlEn = renderToStaticMarkup(
      React.createElement(KeyboardShortcutsModal, {
        onClose: () => {},
        langOverride: 'en',
      })
    );
    expect(htmlEn).toContain('← / →');
    expect(htmlEn).toContain('Browse Armory Vault exhibits');
    expect(CJK_RE.test(htmlEn)).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    const htmlZh = renderToStaticMarkup(
      React.createElement(KeyboardShortcutsModal, {
        onClose: () => {},
        langOverride: 'zh',
      })
    );
    expect(htmlZh).toContain('← / →');
    expect(htmlZh).toContain('在 3D 展馆中左右切换展品');
    expect(WP_LEAK_RE.test(htmlZh)).toBe(false);
  });
});

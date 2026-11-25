import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SECTION_CUT_PLANES,
  sectionAwareMeshRaycast,
} from '../src/engine/actors/PartActor';
import {
  clampSectionCutOffset,
  computeSectionCapRectInto,
  formatSectionOffsetMm,
  getLiveSectionCutZ,
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
  type SectionCapRect,
  sectionPlaneZ,
  syncLiveSectionCutPlane,
} from '../src/engine/actors/StencilSectionCap';
import { resolveWearPresetFromLevel } from '../src/engine/materials/armoryShader';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  scoreSearchMatch,
} from '../src/features/workbench/commandPaletteEngine';
import { CommandPaletteModal } from '../src/features/workbench/CommandPaletteModal';
import { LiveSectionPlaneBar } from '../src/features/workbench/LiveSectionPlaneBar';
import { COMMAND_PALETTE_STRINGS } from '../src/i18n/commandPaletteStrings';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function collectStructuralMismatches(
  zhNode: unknown,
  enNode: unknown,
  nodePath: string,
  issues: string[]
): void {
  if (typeof zhNode !== typeof enNode) {
    issues.push(`${nodePath}: typeof mismatch (${typeof zhNode} vs ${typeof enNode})`);
    return;
  }
  if (typeof zhNode === 'string' && typeof enNode === 'string') {
    if (!zhNode.trim()) issues.push(`${nodePath} [zh]: empty string`);
    if (!enNode.trim()) issues.push(`${nodePath} [en]: empty string`);
    return;
  }
  if (typeof zhNode === 'function' && typeof enNode === 'function') {
    if (zhNode.length !== enNode.length) {
      issues.push(
        `${nodePath}: function arity mismatch (${zhNode.length} vs ${enNode.length})`
      );
    }
    return;
  }
  if (
    zhNode !== null &&
    enNode !== null &&
    typeof zhNode === 'object' &&
    typeof enNode === 'object'
  ) {
    const zhObj = zhNode as Record<string, unknown>;
    const enObj = enNode as Record<string, unknown>;
    const zhKeys = Object.keys(zhObj).sort();
    const enKeys = Object.keys(enObj).sort();
    if (zhKeys.join('|') !== enKeys.join('|')) {
      issues.push(
        `${nodePath}: key mismatch (zh=[${zhKeys.join(',')}] vs en=[${enKeys.join(',')}])`
      );
      return;
    }
    for (const key of zhKeys) {
      collectStructuralMismatches(zhObj[key], enObj[key], `${nodePath}.${key}`, issues);
    }
  }
}

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (typeof node === 'function') {
    const fn = node as (...args: unknown[]) => unknown;
    const sample =
      fn.length === 1
        ? fn(12)
        : fn.length === 2
          ? fn('AK-15M1', 26)
          : fn();
    if (typeof sample === 'string') out.push(sample);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
  return out;
}

describe('V3.0 Global Cmd+K Command Palette & Live CT-Scan Section Plane', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'workbench',
      activeWeaponId: 'ak15',
      lang: 'zh',
      mode: 'explode',
      environmentPreset: 'tactical_vault',
      commandPaletteOpen: false,
    });
    useAppStore.getState().resetAll();
  });

  it('enforces 100% zh/en structural parity and ZERO CJK characters in English strings & items', async () => {
    const issues: string[] = [];
    collectStructuralMismatches(
      COMMAND_PALETTE_STRINGS.zh,
      COMMAND_PALETTE_STRINGS.en,
      'COMMAND_PALETTE_STRINGS',
      issues
    );
    expect(issues).toEqual([]);

    // Strict zero-CJK-in-EN check on the entire English string dictionary
    const enStrings = collectStrings(COMMAND_PALETTE_STRINGS.en);
    expect(enStrings.length).toBeGreaterThan(60);
    for (const text of enStrings) {
      expect(
        CJK_REGEX.test(text),
        `Unexpected CJK character in COMMAND_PALETTE_STRINGS.en: "${text}"`
      ).toBe(false);
    }

    // Strict zero-CJK-in-EN check on built CommandPaletteItem visible fields across active weapon
    useAppStore.getState().setLang('en');
    const akPlugin = await loadWeaponPlugin('ak15');
    const itemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: akPlugin.parts,
    });

    expect(itemsEn.filter((i) => i.group === 'weapons')).toHaveLength(
      WEAPON_IDS.length
    );
    expect(itemsEn.filter((i) => i.group === 'parts')).toHaveLength(
      akPlugin.parts.length
    );

    for (const item of itemsEn) {
      expect(
        CJK_REGEX.test(item.title),
        `CJK leaked into EN item title (${item.id}): "${item.title}"`
      ).toBe(false);
      expect(
        CJK_REGEX.test(item.subtitle),
        `CJK leaked into EN item subtitle (${item.id}): "${item.subtitle}"`
      ).toBe(false);
      if (item.statusBadge) {
        expect(
          CJK_REGEX.test(item.statusBadge),
          `CJK leaked into EN item statusBadge (${item.id}): "${item.statusBadge}"`
        ).toBe(false);
      }
      if (item.codeBadge) {
        expect(
          CJK_REGEX.test(item.codeBadge),
          `CJK leaked into EN item codeBadge (${item.id}): "${item.codeBadge}"`
        ).toBe(false);
      }
    }
  });

  it('matches all 27 exhibits bilingually by name, shortLabel, bayCode, caliber, actionSystem & category', () => {
    const items = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    expect(items.filter((i) => i.group === 'weapons')).toHaveLength(100);

    const searchCases: Array<{ query: string; expectedWeaponId: string }> = [
      { query: 'AK-15M1', expectedWeaponId: 'ak15' },
      { query: '卡拉什尼科夫', expectedWeaponId: 'ak15' },
      { query: 'Luger P08', expectedWeaponId: 'p08' },
      { query: '鲁格 肘节', expectedWeaponId: 'p08' },
      { query: 'BAY-18', expectedWeaponId: 'p08' },
      { query: 'KRISS Vector .45 ACP', expectedWeaponId: 'vector' },
      { query: 'Super V', expectedWeaponId: 'vector' },
      { query: 'M249 LMG', expectedWeaponId: 'm249' },
      { query: '5.7×28mm', expectedWeaponId: 'p90' },
      { query: '.50 BMG', expectedWeaponId: 'm82a1' },
      { query: 'Desert Eagle .50', expectedWeaponId: 'deagle' },
      { query: 'Colt Python .357', expectedWeaponId: 'python' },
      { query: 'Benelli 12 Gauge', expectedWeaponId: 'benellim4' },
      { query: 'Garand .30-06', expectedWeaponId: 'garand' },
      { query: 'Mathews Compound Bow', expectedWeaponId: 'lift33' },
      { query: 'Ravin 复合弩', expectedWeaponId: 'r500' },
      { query: 'roller delayed mp5', expectedWeaponId: 'mp5' },
      { query: 'G11 caseless', expectedWeaponId: 'g11' },
      { query: 'BAY-20', expectedWeaponId: 'g11' },
      { query: 'VSS Vintorez 9×39', expectedWeaponId: 'vss' },
      { query: 'M134D Minigun', expectedWeaponId: 'm134' },
      { query: 'AN-94 Abakan', expectedWeaponId: 'an94' },
      { query: 'ZTZ-99A 125mm', expectedWeaponId: 'ztz99a' },
      { query: 'M1A2 Abrams Turbine', expectedWeaponId: 'm1a2' },
      { query: 'Leopard 2A7V L/55A1', expectedWeaponId: 'leopard2a7' },
      { query: 'Tiger 131 88mm', expectedWeaponId: 'tiger1' },
      { query: 'BAY-24', expectedWeaponId: 'ztz99a' },
      { query: 'BAY-27', expectedWeaponId: 'tiger1' },
    ];

    for (const tc of searchCases) {
      const { groups } = filterCommandPaletteItems(items, tc.query, 'zh');
      const weaponGroup = groups.find((g) => g.id === 'weapons');
      expect(
        weaponGroup?.items.some((i) => i.weaponId === tc.expectedWeaponId),
        `Query "${tc.query}" should match exhibit "${tc.expectedWeaponId}"`
      ).toBe(true);
    }

    // Every single manifest bayCode must uniquely rank its own exhibit #1
    for (const manifest of WEAPON_MANIFESTS) {
      const { groups } = filterCommandPaletteItems(
        items,
        manifest.catalog.bayCode,
        'en'
      );
      const topWeapon = groups.find((g) => g.id === 'weapons')?.items[0];
      expect(topWeapon?.weaponId).toBe(manifest.id);
    }
  });

  it('matches active weapon parts by bomCode, nameZh, nameEn & calloutLabel and jumps to focus part', async () => {
    useAppStore.getState().enterWorkbench('p08', 'explode');
    const p08Plugin = await loadWeaponPlugin('p08');
    const items = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: p08Plugin.parts,
    });

    const samplePart = p08Plugin.parts[0];
    const queries = [
      samplePart.bomCode,
      samplePart.nameZh,
      samplePart.nameEn,
      samplePart.calloutLabel,
    ];
    for (const q of queries) {
      const { groups } = filterCommandPaletteItems(items, q, 'zh');
      const partGroup = groups.find((g) => g.id === 'parts');
      expect(
        partGroup?.items.some((i) => i.partId === samplePart.id),
        `Part query "${q}" should match part "${samplePart.id}"`
      ).toBe(true);
    }

    // Executing a part item from Armory jumps straight to Workbench and selects that exact part
    useAppStore.getState().returnToArmory();
    expect(useAppStore.getState().screen).toBe('armory');

    const targetPartItem = items.find((i) => i.partId === samplePart.id);
    expect(targetPartItem).toBeDefined();
    targetPartItem!.execute();

    expect(useAppStore.getState().screen).toBe('workbench');
    expect(useAppStore.getState().selectedPartId).toBe(samplePart.id);
    expect(useAppStore.getState().mode).toBe('explode');
  });

  it('matches all navigation labs & quick actions and executes store state transitions cleanly', () => {
    const items = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    // Verify labs matching & shortcuts
    const labExpectations: Array<{ query: string; id: string; shortcut?: string }> = [
      { query: 'Armory Vault', id: 'lab:armory' },
      { query: '弹药剖视', id: 'lab:cartridges', shortcut: 'B' },
      { query: 'DOPE 1000m', id: 'lab:ballistics', shortcut: 'R' },
      { query: 'Showdown 流派', id: 'lab:showdown', shortcut: 'S' },
      { query: 'Texture Atlas', id: 'lab:atlas' },
      { query: 'Share Poster 海报', id: 'lab:poster', shortcut: 'U' },
      { query: 'Monograph 图鉴', id: 'lab:monograph', shortcut: '⌘P' },
    ];
    for (const tc of labExpectations) {
      const { flatItems } = filterCommandPaletteItems(items, tc.query, 'en');
      const hit = flatItems.find((i) => i.id === tc.id);
      expect(hit, `Lab query "${tc.query}" should find ${tc.id}`).toBeDefined();
      if (tc.shortcut) {
        expect(hit?.shortcut).toBe(tc.shortcut);
      }
    }

    // Verify quick actions matching & real store execution
    const runAction = (id: string) => {
      const freshItems = buildCommandPaletteItems({
        state: useAppStore.getState(),
        activeWeaponParts: [],
      });
      const item = freshItems.find((i) => i.id === id);
      expect(item, `Missing action ${id}`).toBeDefined();
      item!.execute();
    };

    runAction('action:section-cut');
    expect(useAppStore.getState().sectionCut).toBe(true);

    runAction('action:xray');
    expect(useAppStore.getState().xrayShells).toBe(true);
    expect(useAppStore.getState().sectionCut).toBe(false);

    const wearBefore = resolveWearPresetFromLevel(
      useAppStore.getState().weaponWearLevel
    );
    runAction('action:wear-cycle');
    const wearAfter = resolveWearPresetFromLevel(
      useAppStore.getState().weaponWearLevel
    );
    expect(wearAfter).not.toBe(wearBefore);

    runAction('action:env-daylight');
    expect(useAppStore.getState().environmentPreset).toBe('blueprint_daylight');
    runAction('action:env-bench');
    expect(useAppStore.getState().environmentPreset).toBe('gunsmith_bench');
    runAction('action:env-vault');
    expect(useAppStore.getState().environmentPreset).toBe('tactical_vault');

    runAction('action:field-strip');
    expect(useAppStore.getState().fieldStripActive).toBe(true);

    runAction('action:malfunction');
    expect(useAppStore.getState().malfunctionActive).toBe(true);

    runAction('action:caliper');
    expect(useAppStore.getState().caliperActive).toBe(true);

    runAction('action:engineering-tint');
    expect(useAppStore.getState().engineeringTint).toBe(true);

    runAction('action:language');
    expect(useAppStore.getState().lang).toBe('en');

    runAction('lab:cartridges');
    expect(useAppStore.getState().screen).toBe('cartridges');

    runAction('lab:ballistics');
    expect(useAppStore.getState().screen).toBe('ballistics');

    runAction('lab:atlas');
    expect(useAppStore.getState().textureModalOpen).toBe(true);

    runAction('lab:poster');
    expect(useAppStore.getState().posterShareModalOpen).toBe(true);

    runAction('lab:monograph');
    expect(useAppStore.getState().monographModalOpen).toBe(true);

    // Fuzzy ASCII matching scores compact subsequences > 0 while rejecting gibberish
    expect(scoreSearchMatch('m4a', ['M4A1 Carbine'])).toBeGreaterThan(0);
    expect(scoreSearchMatch('blprnt', ['Blueprint Daylight'])).toBeGreaterThan(0);
    expect(scoreSearchMatch('zzzzqqq', ['Blueprint Daylight'])).toBe(0);
  });

  it('clamps, resets, flips & live-synchronizes sectionCutOffset with SECTION_CUT_PLANES and StencilSectionCap', () => {
    expect(SECTION_CUT_OFFSET_MIN).toBe(-2.5);
    expect(SECTION_CUT_OFFSET_MAX).toBe(2.5);
    expect(SECTION_CUT_OFFSET_STEP).toBe(0.05);
    expect(SECTION_CUT_OFFSET_DEFAULT).toBe(0);

    // Clamping & finite normalization
    expect(clampSectionCutOffset(-10)).toBe(-2.5);
    expect(clampSectionCutOffset(10)).toBe(2.5);
    expect(clampSectionCutOffset(Number.NaN)).toBe(0);
    expect(clampSectionCutOffset(Number.POSITIVE_INFINITY)).toBe(0);
    expect(Object.is(clampSectionCutOffset(-0), 0)).toBe(true);
    expect(clampSectionCutOffset(1.35)).toBe(1.35);

    // Millimeter formatting
    expect(formatSectionOffsetMm(0)).toBe('+0.0 mm');
    expect(formatSectionOffsetMm(-0.001)).toBe('+0.0 mm');
    expect(formatSectionOffsetMm(1.25)).toBe('+12.5 mm');
    expect(formatSectionOffsetMm(-2.5)).toBe('-25.0 mm');

    // Preserve exact plane object identity (zero shader recompilation / zero GC)
    const planeArrayRef = SECTION_CUT_PLANES;
    const planeInstanceRef = SECTION_CUT_PLANES[0];

    expect(useAppStore.getState().sectionCutOffset).toBe(0);
    expect(planeInstanceRef.normal.z).toBe(-1);
    expect(planeInstanceRef.constant).toBe(0);
    expect(getLiveSectionCutZ()).toBe(0);

    useAppStore.getState().setSectionCut(true);
    useAppStore.getState().setSectionCutOffset(1.45);
    expect(useAppStore.getState().sectionCutOffset).toBe(1.45);
    expect(SECTION_CUT_PLANES).toBe(planeArrayRef);
    expect(SECTION_CUT_PLANES[0]).toBe(planeInstanceRef);
    expect(planeInstanceRef.constant).toBeCloseTo(1.45, 6);
    expect(sectionPlaneZ(planeInstanceRef)).toBeCloseTo(1.45, 6);
    expect(getLiveSectionCutZ()).toBeCloseTo(1.45, 6);

    // Out-of-bounds setSectionCutOffset clamps cleanly
    useAppStore.getState().setSectionCutOffset(-99);
    expect(useAppStore.getState().sectionCutOffset).toBe(-2.5);
    expect(planeInstanceRef.constant).toBeCloseTo(-2.5, 6);
    expect(getLiveSectionCutZ()).toBeCloseTo(-2.5, 6);

    // Flip side reverses normal (+Z) while locking the exact world plane Z coordinate
    useAppStore.getState().setSectionCutOffset(0.85);
    useAppStore.getState().toggleSectionCutFlip();
    expect(useAppStore.getState().sectionCutFlip).toBe(true);
    expect(planeInstanceRef.normal.z).toBe(1);
    expect(planeInstanceRef.constant).toBeCloseTo(-0.85, 6);
    expect(sectionPlaneZ(planeInstanceRef)).toBeCloseTo(0.85, 6);

    // StencilSectionCap rect tracks live plane Z dynamically across sweeps
    const shellBox = new THREE.Box3(
      new THREE.Vector3(-8, -2, -1.5),
      new THREE.Vector3(8, 2, 1.5)
    );
    const identity = new THREE.Matrix4();
    const capRect: SectionCapRect = {
      visible: false,
      cx: 0,
      cy: 0,
      width: 0,
      height: 0,
      z: 0,
    };
    computeSectionCapRectInto(
      shellBox,
      identity,
      sectionPlaneZ(SECTION_CUT_PLANES[0]),
      0.16,
      capRect
    );
    expect(capRect.visible).toBe(true);
    expect(capRect.z).toBeCloseTo(0.85, 6);

    // Sweep outside shell depth -> cap automatically hides
    useAppStore.getState().setSectionCutOffset(2.1);
    computeSectionCapRectInto(
      shellBox,
      identity,
      sectionPlaneZ(SECTION_CUT_PLANES[0]),
      0.16,
      capRect
    );
    expect(capRect.visible).toBe(false);

    // Weapon switch resets sectionCutOffset & sectionCutFlip to 0 / false
    useAppStore.getState().selectArmoryWeapon('vector');
    expect(useAppStore.getState().sectionCutOffset).toBe(0);
    expect(useAppStore.getState().sectionCutFlip).toBe(false);
    expect(planeInstanceRef.constant).toBe(0);
    expect(planeInstanceRef.normal.z).toBe(-1);

    // resetAll resets sectionCutOffset & sectionCutFlip cleanly
    useAppStore.getState().setSectionCutOffset(-1.75);
    useAppStore.getState().toggleSectionCutFlip();
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().sectionCut).toBe(false);
    expect(useAppStore.getState().sectionCutOffset).toBe(0);
    expect(useAppStore.getState().sectionCutFlip).toBe(false);
    expect(planeInstanceRef.constant).toBe(0);
    expect(planeInstanceRef.normal.z).toBe(-1);
  });

  it('keeps sectionAwareMeshRaycast 100% locked to the live SECTION_CUT_PLANES sweep and flip', () => {
    const geo = new THREE.BoxGeometry(10, 4, 4); // z spans [-2, +2]
    const mat = new THREE.MeshPhysicalMaterial({
      side: THREE.DoubleSide,
      clippingPlanes: SECTION_CUT_PLANES,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.raycast = sectionAwareMeshRaycast;
    mesh.updateMatrixWorld(true);

    // Offset slightly from (0,0) to avoid hitting the shared quad diagonal twice on BoxGeometry faces
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0.37, 0.21, 10),
      new THREE.Vector3(0, 0, -1)
    );

    try {
      // 1. Center cut (z <= 0 kept): +2 front face is clipped away, only -2 back face hits
      syncLiveSectionCutPlane(0, false);
      const hitsCenter = raycaster.intersectObject(mesh, false);
      expect(hitsCenter).toHaveLength(1);
      expect(hitsCenter[0].point.z).toBeCloseTo(-2, 4);

      // 2. Sweep forward to +2.2 (z <= +2.2 kept): BOTH +2 front and -2 back faces are unclipped
      useAppStore.getState().setSectionCutOffset(2.2);
      const hitsForward = raycaster.intersectObject(mesh, false);
      expect(hitsForward).toHaveLength(2);
      expect(hitsForward[0].point.z).toBeCloseTo(2, 4);
      expect(hitsForward[1].point.z).toBeCloseTo(-2, 4);

      // 3. Sweep behind entire shell to -2.2 (z <= -2.2 kept): ZERO hits
      useAppStore.getState().setSectionCutOffset(-2.2);
      const hitsPastBack = raycaster.intersectObject(mesh, false);
      expect(hitsPastBack).toHaveLength(0);

      // 4. Flip side at z = 0 (z >= 0 kept): +2 front face hits, -2 back face clipped away
      useAppStore.getState().setSectionCutOffset(0);
      useAppStore.getState().toggleSectionCutFlip();
      const hitsFlipped = raycaster.intersectObject(mesh, false);
      expect(hitsFlipped).toHaveLength(1);
      expect(hitsFlipped[0].point.z).toBeCloseTo(2, 4);
    } finally {
      geo.dispose();
      mat.dispose();
    }
  });

  it('wires ARIA dialog/listbox markup, live section slider range & dark/light CSS themes cleanly', () => {
    // 1. SSR CommandPaletteModal ARIA roles & shortcut badges
    const modalHtml = renderToStaticMarkup(
      React.createElement(CommandPaletteModal, { forceOpen: true })
    );
    expect(modalHtml).toContain('role="dialog"');
    expect(modalHtml).toContain('aria-modal="true"');
    expect(modalHtml).toContain('role="combobox"');
    expect(modalHtml).toContain('role="listbox"');
    expect(modalHtml).toContain('role="option"');

    // 2. SSR LiveSectionPlaneBar slider bounds & mm readout
    const sectionBarHtml = renderToStaticMarkup(
      React.createElement(LiveSectionPlaneBar, {
        forceVisible: true,
        offsetOverride: 0.75,
      })
    );
    expect(sectionBarHtml).toContain('live-section-bar');
    expect(sectionBarHtml).toContain('min="-2.5"');
    expect(sectionBarHtml).toContain('max="2.5"');
    expect(sectionBarHtml).toContain('step="0.05"');
    expect(sectionBarHtml).toContain('+7.5 mm');

    // 3. CSS bundle & light/dark theme contracts
    const indexCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/index.css'),
      'utf8'
    );
    const paletteCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/command-palette.css'),
      'utf8'
    );
    expect(indexCss).toContain("@import './command-palette.css';");
    expect(paletteCss).toContain('pointer-events: auto');
    expect(paletteCss).toContain("[data-theme='light']");
    expect(paletteCss).toContain('.cmdk-dialog');
    expect(paletteCss).toContain('.live-section-bar');
    expect(paletteCss).toContain('.workbench-popover-menu');
  });
});

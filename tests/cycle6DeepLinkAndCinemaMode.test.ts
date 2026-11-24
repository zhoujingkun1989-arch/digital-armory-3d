import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
  formatMuseumDocumentTitle,
  parseMuzzleUrlParam,
  parseOpticUrlParam,
  parseSectionAxisUrlParam,
  serializeMuzzleUrlParam,
  triggerSlowMoCutawayCinema as triggerCinemaFromSync,
} from '../src/app/useUrlStateSync';
import { useAttachmentStore } from '../src/engine/attachments/attachmentStore';
import { useTankCrewStore } from '../src/engine/tank/tankCrewStore';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import { triggerSlowMoCutawayCinema } from '../src/features/workbench/TimelineDock';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { type AppScreen, useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

afterEach(() => {
  useAttachmentStore.getState().resetAll();
  useTankCrewStore.getState().setActive(false);
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 6A — Exact 3D View Deep-Links, Slow-Mo Cutaway Cinema & Dynamic Titles', () => {
  it('round-trips axis, slice, xray, tint, muzzle, optic & valid part deep-link URL parameters cleanly', async () => {
    const m4Plugin = await loadWeaponPlugin('m4a1');
    const validPartId = m4Plugin.parts[0].id;

    applyLocationToStore(
      `?screen=workbench&weapon=m4a1&mode=firing&cut=1&axis=x&slice=120&tint=1&muzzle=suppressor&optic=lpvo&part=${validPartId}&lang=en`
    );

    const st = useAppStore.getState();
    const att = useAttachmentStore.getState().loadouts.m4a1;
    expect(st.screen).toBe('workbench');
    expect(st.activeWeaponId).toBe('m4a1');
    expect(st.mode).toBe('firing');
    expect(st.sectionCut).toBe(true);
    expect(st.sectionCutAxis).toBe('x');
    expect(st.sectionCutOffset).toBeCloseTo(12, 3);
    expect(st.xrayShells).toBe(false);
    expect(st.engineeringTint).toBe(true);
    expect(st.selectedPartId).toBe(validPartId);
    expect(st.lang).toBe('en');
    expect(att?.muzzle).toBe('suppressor');
    expect(att?.optic).toBe('lpvo');

    const rebuilt = buildSearchString(
      'm4a1',
      'workbench',
      'firing',
      true,
      'en',
      '556_nato',
      true,
      '556_nato',
      '',
      undefined,
      {
        sectionCutAxis: st.sectionCutAxis,
        sectionCutOffset: st.sectionCutOffset,
        xrayShells: st.xrayShells,
        engineeringTint: st.engineeringTint,
        muzzle: att?.muzzle,
        optic: att?.optic,
        selectedPartId: st.selectedPartId,
      }
    );
    const params = new URLSearchParams(rebuilt);
    expect(params.get('screen')).toBe('workbench');
    expect(params.get('weapon')).toBe('m4a1');
    expect(params.get('cut')).toBe('1');
    expect(params.get('axis')).toBe('x');
    expect(params.get('slice')).toBe('120');
    expect(params.get('tint')).toBe('1');
    expect(params.get('muzzle')).toBe('suppressor');
    expect(params.get('optic')).toBe('lpvo');
    expect(params.get('part')).toBe(validPartId);

    // X-Ray deep-link (mutually exclusive with sectionCut) + muzzle brake shorthand round-trip
    applyLocationToStore(
      '?screen=workbench&weapon=m4a1&mode=explode&xray=1&muzzle=brake&optic=red_dot'
    );
    const xraySt = useAppStore.getState();
    expect(xraySt.xrayShells).toBe(true);
    expect(xraySt.sectionCut).toBe(false);
    expect(useAttachmentStore.getState().loadouts.m4a1?.muzzle).toBe(
      'muzzle_brake'
    );
    expect(useAttachmentStore.getState().loadouts.m4a1?.optic).toBe('red_dot');
    const xrayRebuilt = buildSearchString(
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
      {
        xrayShells: true,
        muzzle: 'muzzle_brake',
        optic: 'red_dot',
      }
    );
    const xrayParams = new URLSearchParams(xrayRebuilt);
    expect(xrayParams.get('xray')).toBe('1');
    expect(xrayParams.get('muzzle')).toBe('brake');
    expect(xrayParams.get('optic')).toBe('red_dot');
    expect(xrayParams.has('cut')).toBe(false);

    // Muzzle brake accepts both `brake` and `muzzle_brake` and serializes concisely as `brake`
    expect(parseMuzzleUrlParam('brake')).toBe('muzzle_brake');
    expect(parseMuzzleUrlParam('muzzle_brake')).toBe('muzzle_brake');
    expect(serializeMuzzleUrlParam('muzzle_brake')).toBe('brake');
    expect(serializeMuzzleUrlParam('none')).toBeNull();
    expect(parseOpticUrlParam('thermal')).toBe('thermal');
    expect(parseSectionAxisUrlParam('box')).toBe('box');

    // Navigating away from workbench strips workbench-only deep-link params
    const armoryUrl = buildSearchString(
      'm4a1',
      'armory',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '556_nato',
      rebuilt
    );
    const armoryParams = new URLSearchParams(armoryUrl);
    for (const key of ['axis', 'slice', 'xray', 'tint', 'muzzle', 'optic', 'part']) {
      expect(armoryParams.has(key)).toBe(false);
    }
  });

  it('safely clamps out-of-range slice offsets and rejects malformed deep-link params without throwing', async () => {
    await loadWeaponPlugin('ak15');

    applyLocationToStore(
      '?screen=workbench&weapon=ak15&cut=1&axis=invalid_axis&slice=99999&muzzle=laser_cannon&optic=alien_scope&part=<script>bad</script>'
    );
    let st = useAppStore.getState();
    expect(st.sectionCut).toBe(true);
    expect(st.sectionCutAxis).toBe('z');
    // Small-arms Z range clamps to +2.5 cm (+25 mm)
    expect(st.sectionCutOffset).toBe(2.5);
    expect(st.selectedPartId).toBeNull();
    expect(useAttachmentStore.getState().loadouts.ak15).toBeUndefined();

    // Non-numeric slice and nonexistent part ID are safely ignored
    applyLocationToStore(
      '?screen=workbench&weapon=ak15&cut=1&slice=NaN&part=does_not_exist_999'
    );
    st = useAppStore.getState();
    expect(st.sectionCutOffset).toBe(0);
    expect(st.selectedPartId).toBeNull();

    // 1:1 Main Battle Tank scale slice (+1400 mm = +140 cm) + Crew FLIR optic compatibility
    applyLocationToStore(
      '?screen=workbench&weapon=ztz99a&cut=1&axis=z&slice=1400&panel=crew&optic=flir'
    );
    expect(useAppStore.getState().sectionCutOffset).toBe(140);
    expect(useTankCrewStore.getState().active).toBe(true);
    expect(useTankCrewStore.getState().opticMode).toBe('flir_whot');
  });

  it('orchestrates 1-click Matt Rittman Slow-Mo Cutaway Cinema Demo cleanly from any screen', () => {
    expect(triggerSlowMoCutawayCinema).toBe(triggerCinemaFromSync);

    useAppStore.getState().selectArmoryWeapon('m1911');
    useAppStore.getState().returnToArmory();
    expect(useAppStore.getState().screen).toBe('armory');

    triggerSlowMoCutawayCinema();

    const st = useAppStore.getState();
    expect(st.screen).toBe('workbench');
    expect(st.activeWeaponId).toBe('m1911');
    expect(st.mode).toBe('firing');
    expect(st.sectionCut).toBe(true);
    expect(st.xrayShells).toBe(false);
    expect(st.gasFlowVisible).toBe(true);
    expect(st.telemetryHudOpen).toBe(true);
    expect(st.fireSpeedMultiplier).toBe(0.25);
    expect(st.fireLoop).toBe(true);
    expect(st.cameraCommand.preset).toBe('cutaway_focus');
    expect(st.isFiringPlaying).toBe(true);
    expect(st.fieldStripActive).toBe(false);
    expect(st.malfunctionActive).toBe(false);
  });

  it('formats dynamic bilingual document.title across all 6 screens & exhibits with strictly 0 CJK in English', () => {
    const screens: readonly AppScreen[] = [
      'showcase',
      'armory',
      'workbench',
      'ballistics',
      'cartridges',
      'split_showdown',
    ];
    const sampleWeapons: readonly WeaponId[] = [
      'm1911',
      'ak15',
      'ztz99a',
      'gau8',
      'lift33',
    ];

    for (const screen of screens) {
      for (const weaponId of sampleWeapons) {
        const enTitle = formatMuseumDocumentTitle(screen, weaponId, 'en', {
          mode: 'firing',
          sectionCut: true,
          cartridgeCaliber: '125mm_apfsds',
          ballisticsCaliber: '30x173_gau8',
          splitWeaponA: weaponId,
          splitWeaponB: 'm4a1',
        });
        const zhTitle = formatMuseumDocumentTitle(screen, weaponId, 'zh', {
          mode: 'firing',
          sectionCut: true,
          cartridgeCaliber: '125mm_apfsds',
          ballisticsCaliber: '30x173_gau8',
          splitWeaponA: weaponId,
          splitWeaponB: 'm4a1',
        });

        expect(enTitle.length).toBeGreaterThan(10);
        expect(enTitle).toContain('Digital Armory 3D');
        expect(CJK_RE.test(enTitle), `CJK leak in EN title: ${enTitle}`).toBe(
          false
        );
        expect(zhTitle.length).toBeGreaterThan(8);
      }
    }

    expect(
      formatMuseumDocumentTitle('workbench', 'm1911', 'en', {
        mode: 'firing',
        sectionCut: true,
      })
    ).toBe('Colt M1911A1 · 3D Cutaway | Digital Armory 3D');
    expect(
      formatMuseumDocumentTitle('workbench', 'm1911', 'zh', {
        mode: 'firing',
        sectionCut: true,
      })
    ).toContain('3D 剖视工作台');
  });

  it('surfaces Slow-Mo Cutaway Cinema Demo & Copy 3D View Link in Cmd+K, TimelineDock & WorkbenchHeader', () => {
    useAppStore.getState().setLang('en');
    const itemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    const defaultFiltered = filterCommandPaletteItems(itemsEn, '', 'en');
    const actionIds =
      defaultFiltered.groups
        .find((g) => g.id === 'actions')
        ?.items.map((i) => i.id) ?? [];
    expect(actionIds).toContain('action:slow-mo-cutaway-cinema');
    expect(actionIds).toContain('action:copy-3d-view-link');

    const cinemaSearch = filterCommandPaletteItems(itemsEn, 'slowmo', 'en');
    expect(cinemaSearch.flatItems[0]?.id).toBe('action:slow-mo-cutaway-cinema');

    const copySearch = filterCommandPaletteItems(itemsEn, 'copy link', 'en');
    expect(copySearch.flatItems[0]?.id).toBe('action:copy-3d-view-link');

    // Execute palette cinema demo directly
    cinemaSearch.flatItems[0].execute();
    expect(useAppStore.getState().mode).toBe('firing');
    expect(useAppStore.getState().sectionCut).toBe(true);
    expect(useAppStore.getState().fireSpeedMultiplier).toBe(0.25);

    // Verify EN UI strings have 0 CJK and components + CSS wire toast & pill cleanly
    expect(CJK_RE.test(UI_STRINGS.en.workbench.copyViewLinkBtn)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.workbench.copyViewLinkToast)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.timeline.cinemaDemoPill)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.timeline.cinemaDemoCmdTitle)).toBe(false);

    const wbHeaderSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/WorkbenchHeader.tsx'),
      'utf8'
    );
    expect(wbHeaderSrc).toContain('wb-copy-view-link-btn');
    expect(wbHeaderSrc).toContain('wb-copy-link-toast');
    expect(wbHeaderSrc).toContain('subscribeCopyViewLinkToast');

    const dockSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/TimelineDock.tsx'),
      'utf8'
    );
    expect(dockSrc).toContain('cinema-demo-btn');
    expect(dockSrc).toContain('triggerSlowMoCutawayCinema');

    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.cinema-demo-pill');
    expect(wbCss).toContain('.wb-copy-link-toast');
  });
});

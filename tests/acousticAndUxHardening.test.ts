import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BESPOKE_WEAPON_ACOUSTIC_SIGNATURES,
  type FiringSoundEventKind,
  getWeaponBespokeAcousticSignature,
  K98K_STRIPPER_CLIP_PING_PARTIALS_HZ,
  M1911_MAG_LATCH_PARTIALS_HZ,
  playPressCheckSpringSound,
  playWeaponFiringEventSound,
  resolveWeaponMechanismAcousticStyle,
} from '../src/engine/audio/mechanicalSoundEngine';
import {
  CARTRIDGE_LAB_ORDER,
  TANK_ORDNANCE_ORDER,
} from '../src/engine/cartridges/cartridgeSpecs';
import { PENETRATOR_IDS } from '../src/engine/physics/armorPenetration';
import { EXTERNAL_PROJECTILE_ORDER } from '../src/engine/physics/externalBallistics';
import {
  ARMORY_HOVER_PRELOAD_DEBOUNCE_MS,
  ArmoryRackBayCard,
} from '../src/features/armory/ArmoryView';
import { ArmorPenetrationModal } from '../src/features/armorlab/ArmorPenetrationModal';
import { ArmorerPassportModal } from '../src/features/passport/ArmorerPassportModal';
import { PASSPORT_STRINGS } from '../src/features/passport/passportStrings';
import CausalitySandboxModal from '../src/features/sandbox/CausalitySandboxModal';
import { PosterShareModal } from '../src/features/share/PosterShareModal';
import { WeaponStoryDrawer } from '../src/features/story/WeaponStoryDrawer';
import { HistoryTimelineModal } from '../src/features/timeline/HistoryTimelineModal';
import {
  HISTORY_TIMELINE_NODES,
  HISTORY_TIMELINE_TOURS,
  TIMELINE_LINEAGES,
} from '../src/features/timeline/historyTimelineSpecs';
import { DirectorReelModal } from '../src/features/video/DirectorReelModal';
import { buildCommandPaletteItems } from '../src/features/workbench/commandPaletteEngine';
import { COMMAND_PALETTE_STRINGS } from '../src/i18n/commandPaletteStrings';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import {
  MUSEUM_BALLISTICS_PROFILE_COUNT,
  MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT,
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_FIREARM_COUNT,
  MUSEUM_HALL_COUNT,
  MUSEUM_HALL_COUNTS,
  MUSEUM_HEAVY_ARMOR_COUNT,
  MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT,
  MUSEUM_METRICS,
  MUSEUM_ORDNANCE_COUNT,
  MUSEUM_PENETRATOR_COUNT,
  MUSEUM_SMALL_ARMS_CALIBER_COUNT,
  MUSEUM_TIMELINE_LINEAGE_COUNT,
  MUSEUM_TIMELINE_MAX_YEAR,
  MUSEUM_TIMELINE_MIN_YEAR,
  MUSEUM_TIMELINE_NODE_COUNT,
  MUSEUM_TIMELINE_TOUR_COUNT,
  MUSEUM_TOTAL_PARTS,
  MUSEUM_VERSION,
  resolveArmorLabPresetForWeapon,
} from '../src/weapons/museumMetrics';

const ROOT = process.cwd();
const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function assertDialogAriaInMarkup(markup: string, label: string): void {
  expect(markup, `${label} missing role="dialog"`).toContain('role="dialog"');
  expect(markup, `${label} missing aria-modal="true"`).toContain(
    'aria-modal="true"'
  );
  const labelledByMatch = markup.match(/aria-labelledby="([^"]+)"/);
  expect(
    labelledByMatch,
    `${label} missing aria-labelledby attribute`
  ).not.toBeNull();
  const titleId = labelledByMatch![1];
  expect(
    markup,
    `${label} aria-labelledby="${titleId}" does not match any heading id`
  ).toContain(`id="${titleId}"`);
}

interface RecordedAudioEvents {
  oscFreqs: number[];
  filterFreqs: number[];
}

function createMockAudioContextClass(log: RecordedAudioEvents) {
  const makeAudioParam = (bucket?: number[]) => ({
    value: 0,
    setValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    setTargetAtTime: () => {},
  });

  const makeNode = () => ({
    connect: () => {},
    disconnect: () => {},
  });

  return class MockAudioContext {
    public state: AudioContextState = 'running';
    public sampleRate = 48000;
    public currentTime = 1.0;
    public destination = makeNode();

    public resume(): Promise<void> {
      return Promise.resolve();
    }

    public createDynamicsCompressor() {
      return {
        ...makeNode(),
        threshold: makeAudioParam(),
        knee: makeAudioParam(),
        ratio: makeAudioParam(),
        attack: makeAudioParam(),
        release: makeAudioParam(),
      };
    }

    public createGain() {
      return {
        ...makeNode(),
        gain: makeAudioParam(),
      };
    }

    public createConvolver() {
      return {
        ...makeNode(),
        normalize: false,
        buffer: null as AudioBuffer | null,
      };
    }

    public createBuffer(
      channels: number,
      length: number,
      sampleRate: number
    ): AudioBuffer {
      const chData = Array.from(
        { length: channels },
        () => new Float32Array(length)
      );
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (idx: number) => chData[idx],
      } as unknown as AudioBuffer;
    }

    public createBufferSource() {
      return {
        ...makeNode(),
        buffer: null as AudioBuffer | null,
        start: () => {},
        stop: () => {},
      };
    }

    public createBiquadFilter() {
      return {
        ...makeNode(),
        type: 'bandpass' as BiquadFilterType,
        Q: makeAudioParam(),
        frequency: makeAudioParam(log.filterFreqs),
      };
    }

    public createWaveShaper() {
      return {
        ...makeNode(),
        curve: null as Float32Array | null,
      };
    }

    public createOscillator() {
      return {
        ...makeNode(),
        type: 'sine' as OscillatorType,
        frequency: makeAudioParam(log.oscFreqs),
        start: () => {},
        stop: () => {},
      };
    }
  };
}

describe('V6.0 Acoustic Fidelity, SSOT Metrics, Cross-Lab UX & WCAG 2.1 AA Hardening', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'workbench',
      activeWeaponId: 'ak15',
      lang: 'zh',
      mode: 'explode',
      sfxMuted: false,
      storyOpen: false,
      storyMinimized: false,
      armorPenetrationModalOpen: false,
      armorPenetrationLaunchOptions: null,
      causalitySandboxOpen: false,
      passportModalOpen: false,
      timelineModalOpen: false,
      directorReelModalOpen: false,
      posterShareModalOpen: false,
    });
  });

  afterEach(() => {
    useAppStore.getState().closeArmorPenetrationModal();
  });

  it('derives museumMetrics dynamically from WEAPON_MANIFESTS and pure domain specs with 100% accuracy', () => {
    const manifestPartsSum = WEAPON_MANIFESTS.reduce(
      (sum, m) => sum + m.catalog.partsCount,
      0
    );

    expect(MUSEUM_VERSION).toBe('v6.0');
    expect(MUSEUM_EXHIBIT_COUNT).toBe(WEAPON_MANIFESTS.length);
    expect(MUSEUM_EXHIBIT_COUNT).toBe(100);
    expect(MUSEUM_TOTAL_PARTS).toBe(manifestPartsSum);
    expect(MUSEUM_TOTAL_PARTS).toBe(2174);
    expect(MUSEUM_HALL_COUNT).toBe(10);
    expect(MUSEUM_HALL_COUNTS.all).toBe(100);
    expect(MUSEUM_HEAVY_ARMOR_COUNT).toBe(8);
    expect(MUSEUM_ORDNANCE_COUNT).toBe(4);
    expect(MUSEUM_FIREARM_COUNT).toBe(83);
    expect(MUSEUM_SMALL_ARMS_CALIBER_COUNT).toBe(CARTRIDGE_LAB_ORDER.length);
    expect(MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT).toBe(
      TANK_ORDNANCE_ORDER.length
    );
    expect(MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT).toBe(
      CARTRIDGE_LAB_ORDER.length + TANK_ORDNANCE_ORDER.length
    );
    expect(MUSEUM_BALLISTICS_PROFILE_COUNT).toBe(
      EXTERNAL_PROJECTILE_ORDER.length
    );
    expect(MUSEUM_PENETRATOR_COUNT).toBe(PENETRATOR_IDS.length);
    expect(MUSEUM_TIMELINE_MIN_YEAR).toBe(
      Math.min(...HISTORY_TIMELINE_NODES.map((n) => n.year))
    );
    expect(MUSEUM_TIMELINE_MAX_YEAR).toBe(
      Math.max(2026, ...HISTORY_TIMELINE_NODES.map((n) => n.year))
    );
    expect(MUSEUM_TIMELINE_LINEAGE_COUNT).toBe(TIMELINE_LINEAGES.length);
    expect(MUSEUM_TIMELINE_TOUR_COUNT).toBe(HISTORY_TIMELINE_TOURS.length);
    expect(MUSEUM_TIMELINE_NODE_COUNT).toBe(HISTORY_TIMELINE_NODES.length);
    expect(MUSEUM_METRICS.exhibitCount).toBe(MUSEUM_EXHIBIT_COUNT);
    expect(MUSEUM_METRICS.totalParts).toBe(MUSEUM_TOTAL_PARTS);

    // Guard first-paint bundle splitting: museumMetrics.ts must NOT statically runtime-import lazy modal modules
    const metricsSrc = fs.readFileSync(
      path.join(ROOT, 'src/weapons/museumMetrics.ts'),
      'utf8'
    );
    expect(metricsSrc).not.toMatch(/historyTimelineSpecs/);
    expect(metricsSrc).not.toMatch(
      /import\s*\{[^}]*\}\s*from\s*['"][^'"]*armorPenetration['"]/
    );
  });

  it('has ZERO stale 27/29/731/v5.0/1898 exhibit count leaks across audited UI & i18n files and 0 CJK in EN', () => {
    const auditedFiles = [
      'src/features/armory/ArmoryView.tsx',
      'src/features/workbench/WorkbenchHeader.tsx',
      'src/features/workbench/commandPaletteEngine.ts',
      'src/i18n/commandPaletteStrings.ts',
      'src/features/passport/passportStrings.ts',
      'src/features/timeline/HistoryTimelineModal.tsx',
    ];

    const stalePatterns: RegExp[] = [
      /\b27[- ]exhibit/i,
      /27\s*(?:展品|款)/,
      /\b29[- ]exhibit/i,
      /29\s*款/,
      /\b731\b/,
      /\bv5\.0\b/i,
      /\b1898\s*[-–]\s*2026\b/,
      /86\s*(?:套|suites)/i,
      /369\s*(?:张|2K\/4K)/i,
    ];

    for (const relPath of auditedFiles) {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      for (const pattern of stalePatterns) {
        expect(
          pattern.test(content),
          `Stale metric pattern ${pattern} leaked in ${relPath}`
        ).toBe(false);
      }
    }

    // Verify runtime evaluated bilingual strings carry accurate SSOT counts and 0 CJK in EN
    expect(COMMAND_PALETTE_STRINGS.zh.modal.groups.weapons).toContain('100');
    expect(COMMAND_PALETTE_STRINGS.en.modal.groups.weapons).toContain('100');
    expect(COMMAND_PALETTE_STRINGS.en.trigger.title).toContain('2174');
    expect(PASSPORT_STRINGS.zh.title).toContain('100');
    expect(PASSPORT_STRINGS.en.title).toContain('100-Exhibit');
    expect(CJK_REGEX.test(JSON.stringify(PASSPORT_STRINGS.en))).toBe(false);

    useAppStore.getState().setLang('en');
    const paletteItemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });
    const passportCmd = paletteItemsEn.find((i) => i.id === 'lab:passport');
    const timelineCmd = paletteItemsEn.find(
      (i) => i.id === 'lab:history-timeline'
    );
    expect(passportCmd?.title).toContain('100-Exhibit');
    expect(timelineCmd?.title).toContain('1415');
    expect(timelineCmd?.subtitle).toContain('100 exhibits');
    for (const item of paletteItemsEn) {
      expect(CJK_REGEX.test(item.title)).toBe(false);
      expect(CJK_REGEX.test(item.subtitle)).toBe(false);
    }
  });

  it('delivers bespoke acoustic signatures and synthesized audio events for M1911A1 and Mauser K98k', () => {
    expect(resolveWeaponMechanismAcousticStyle('m1911')).toBe(
      'browning_single_link'
    );
    expect(resolveWeaponMechanismAcousticStyle('k98k')).toBe('mauser_crf_bolt');
    expect(resolveWeaponMechanismAcousticStyle('vector')).toBe('super_v_smg');
    expect(resolveWeaponMechanismAcousticStyle('awm')).toBe('bolt_action');

    const m1911Sig = getWeaponBespokeAcousticSignature('m1911');
    const k98kSig = getWeaponBespokeAcousticSignature('k98k');
    expect(m1911Sig).not.toBeNull();
    expect(k98kSig).not.toBeNull();
    expect(BESPOKE_WEAPON_ACOUSTIC_SIGNATURES.m1911).toBe(m1911Sig);
    expect(BESPOKE_WEAPON_ACOUSTIC_SIGNATURES.k98k).toBe(k98kSig);
    expect(CJK_REGEX.test(m1911Sig!.labelEn)).toBe(false);
    expect(CJK_REGEX.test(k98kSig!.labelEn)).toBe(false);
    expect(M1911_MAG_LATCH_PARTIALS_HZ).toEqual([2180, 3940, 5620]);
    expect(K98K_STRIPPER_CLIP_PING_PARTIALS_HZ).toEqual([
      2420, 4180, 6140, 7920,
    ]);

    const allCues: FiringSoundEventKind[] = [
      'sear_release',
      'primer_ignition',
      'gas_or_recoil',
      'cam_unlock',
      'extract_eject',
      'spring_feed',
      'battery_lockup',
      'sear_reset',
    ];

    // 1. Headless-safe without window/AudioContext
    expect(() => {
      for (const kind of allCues) {
        playWeaponFiringEventSound(kind, 'm1911', 1.0);
        playWeaponFiringEventSound(kind, 'k98k', 0.25);
      }
    }).not.toThrow();

    // 2. Deterministic Web Audio node scheduling verification via mock AudioContext
    const log: RecordedAudioEvents = { oscFreqs: [], filterFreqs: [] };
    const MockAudioContext = createMockAudioContextClass(log);
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      AudioContext: MockAudioContext,
    };

    try {
      // M1911A1 full cycle + press-check
      log.oscFreqs.length = 0;
      log.filterFreqs.length = 0;
      for (const kind of allCues) {
        playWeaponFiringEventSound(kind, 'm1911', 0.25);
      }
      useAppStore.setState({ activeWeaponId: 'm1911' });
      playPressCheckSpringSound('pull');
      playPressCheckSpringSound('release');

      // Assert M1911 external hammer fall (1640 Hz), single-stack steel mag latch (2180/3940/5620 Hz),
      // and forged steel barrel-link battery lockup clack (1340 / 1760 Hz)
      expect(log.oscFreqs.some((f) => Math.abs(f - 1640) < 30)).toBe(true);
      expect(log.oscFreqs.some((f) => Math.abs(f - 1760) < 30)).toBe(true);
      for (const partialHz of M1911_MAG_LATCH_PARTIALS_HZ) {
        expect(
          log.oscFreqs.some((f) => Math.abs(f - partialHz) < 35),
          `Missing M1911 mag-latch partial near ${partialHz} Hz`
        ).toBe(true);
      }
      // Must NOT fall through into KRISS Vector's 126->68 Hz Super V slider plunge
      expect(log.oscFreqs.some((f) => Math.abs(f - 126) < 2)).toBe(false);

      // Mauser K98k full 4-stroke cycle + press-check
      log.oscFreqs.length = 0;
      log.filterFreqs.length = 0;
      for (const kind of allCues) {
        playWeaponFiringEventSound(kind, 'k98k', 0.25);
      }
      useAppStore.setState({ activeWeaponId: 'k98k' });
      playPressCheckSpringSound('pull');
      playPressCheckSpringSound('release');

      // Assert K98k 90° bolt lift (1060 Hz), 11cm rear raceway slide (1320->2680 Hz),
      // dual-lug forward camming lock (980 / 1340 Hz), and 5-rd stripper-clip metallic ping partials
      expect(log.oscFreqs.some((f) => Math.abs(f - 1060) < 25)).toBe(true);
      expect(log.filterFreqs.some((f) => Math.abs(f - 1320) < 25)).toBe(true);
      expect(log.oscFreqs.some((f) => Math.abs(f - 1340) < 25)).toBe(true);
      for (const clipHz of K98K_STRIPPER_CLIP_PING_PARTIALS_HZ) {
        expect(
          log.oscFreqs.some((f) => Math.abs(f - clipHz) < 40),
          `Missing K98k stripper-clip ping partial near ${clipHz} Hz`
        ).toBe(true);
      }
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  });

  it('maps contextual Armor Penetration Lab penetrators & targets seamlessly across exhibits', () => {
    expect(resolveArmorLabPresetForWeapon('gau8')).toEqual({
      projectileId: '30x173_gau8',
      targetTankId: 'ztz99a',
    });
    expect(resolveArmorLabPresetForWeapon('ztz99a')).toEqual({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
    });
    expect(resolveArmorLabPresetForWeapon('m1a2')).toEqual({
      projectileId: '120mm_apfsds',
      targetTankId: 'm1a2',
    });
    expect(resolveArmorLabPresetForWeapon('leopard2a7')).toEqual({
      projectileId: '120mm_apfsds',
      targetTankId: 'leopard2a7',
    });
    expect(resolveArmorLabPresetForWeapon('tiger1')).toEqual({
      projectileId: '88mm_pzgr39',
      targetTankId: 'tiger1',
    });
    expect(resolveArmorLabPresetForWeapon('m82a1')).toEqual({
      projectileId: '50_bmg',
      targetTankId: 'ztz99a',
    });
    expect(resolveArmorLabPresetForWeapon('ak15')).toEqual({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
    });

    // Store auto-preselection when launching from GAU-8/A Workbench
    useAppStore.setState({ activeWeaponId: 'gau8' });
    useAppStore.getState().openArmorPenetrationModal();
    expect(useAppStore.getState().armorPenetrationModalOpen).toBe(true);
    const launchOpts = useAppStore.getState().armorPenetrationLaunchOptions;
    expect(launchOpts).toEqual({
      projectileId: '30x173_gau8',
      targetTankId: 'ztz99a',
    });

    const gau8Markup = renderToStaticMarkup(
      React.createElement(ArmorPenetrationModal, {
        onClose: () => {},
        initialProjectileId: launchOpts?.projectileId,
        initialTargetTankId: launchOpts?.targetTankId,
      })
    );
    expect(gau8Markup).toMatch(
      /class="armor-select-btn is-active"[^>]*><strong>30×173mm PGU-14\/B API<\/strong>/
    );

    useAppStore.getState().closeArmorPenetrationModal();
    expect(useAppStore.getState().armorPenetrationLaunchOptions).toBeNull();
  });

  it('memoizes ArmoryRackBayCard and configures 180ms debounced hover preloading', () => {
    const memoSymbol = (ArmoryRackBayCard as unknown as { $$typeof?: symbol })
      .$$typeof;
    expect(memoSymbol).toBe(Symbol.for('react.memo'));
    expect(ARMORY_HOVER_PRELOAD_DEBOUNCE_MS).toBe(180);

    const armorySrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/ArmoryView.tsx'),
      'utf8'
    );
    expect(armorySrc).toContain('onMouseLeave={clearHoverPreload}');
    expect(armorySrc).toContain('React.memo');
  });

  it('enforces WCAG 2.1 AA dialog ARIA attributes, useDialogAccessibility wiring, reduced motion & 44px touch targets', () => {
    const noop = () => {};

    // 1. Render all 7 owned modal/drawer components and validate role="dialog", aria-modal="true", aria-labelledby -> heading id
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(ArmorerPassportModal, { onClose: noop })
      ),
      'ArmorerPassportModal'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(HistoryTimelineModal, { onClose: noop })
      ),
      'HistoryTimelineModal'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(WeaponStoryDrawer, { forceOpen: true })
      ),
      'WeaponStoryDrawer'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(PosterShareModal, { open: true, onClose: noop })
      ),
      'PosterShareModal'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(React.createElement(CausalitySandboxModal)),
      'CausalitySandboxModal'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(DirectorReelModal, { onClose: noop })
      ),
      'DirectorReelModal'
    );
    assertDialogAriaInMarkup(
      renderToStaticMarkup(
        React.createElement(ArmorPenetrationModal, { onClose: noop })
      ),
      'ArmorPenetrationModal'
    );

    // 2. Verify all 7 modals wire useDialogAccessibility
    const modalFiles = [
      'src/features/passport/ArmorerPassportModal.tsx',
      'src/features/timeline/HistoryTimelineModal.tsx',
      'src/features/story/WeaponStoryDrawer.tsx',
      'src/features/share/PosterShareModal.tsx',
      'src/features/sandbox/CausalitySandboxModal.tsx',
      'src/features/video/DirectorReelModal.tsx',
      'src/features/armorlab/ArmorPenetrationModal.tsx',
    ];
    for (const relPath of modalFiles) {
      const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      expect(src, `${relPath} must use useDialogAccessibility`).toContain(
        'useDialogAccessibility('
      );
    }

    // 3. Verify prefers-reduced-motion rules across all 5 V6 CSS files + 44px touch targets in responsive.css
    const v6CssFiles = [
      'src/styles/armor-penetration.css',
      'src/styles/external-ballistics.css',
      'src/styles/attachment-bench.css',
      'src/styles/split-showdown.css',
      'src/styles/timeline-museum.css',
    ];
    for (const relPath of v6CssFiles) {
      const css = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      expect(
        css,
        `${relPath} missing @media (prefers-reduced-motion: reduce)`
      ).toContain('@media (prefers-reduced-motion: reduce)');
    }

    const responsiveCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/responsive.css'),
      'utf8'
    );
    expect(responsiveCss).toContain('min-height: 44px');
    expect(responsiveCss).toContain('min-width: 44px');
    expect(responsiveCss).toContain('overscroll-behavior: contain');
  });
});

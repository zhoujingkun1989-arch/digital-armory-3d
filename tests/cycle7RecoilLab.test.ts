import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecoilLabModal } from '../src/features/recoillab/RecoilLabModal';
import {
  evaluateRecoilDynamics,
  formatForceValue,
  formatImpulse,
  formatRecoilEnergy,
  formatTorque,
  RECOIL_EXHIBIT_PROFILES,
  RECOIL_LAB_STRINGS,
  RECOIL_MATCHUP_PRESETS,
  RECOIL_WAVEFORM_SAMPLES,
  RECOIL_WAVEFORM_WINDOW_MS,
} from '../src/features/recoillab/recoilPhysics';
import { WEAPON_IDS } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe('Cycle 7C · Recoil Impulse, Gas-Jet Momentum & Muzzle-Climb Physics Engine', () => {
  it('evaluates finite, momentum-conserving recoil dynamics across all 34 exhibits with 120-point F(t) waveforms', () => {
    expect(RECOIL_EXHIBIT_PROFILES).toHaveLength(34);
    const seen = new Set(RECOIL_EXHIBIT_PROFILES.map((p) => p.weaponId));
    expect(seen.size).toBe(34);
    for (const id of WEAPON_IDS) {
      expect(seen.has(id), `Missing ${id} in RECOIL_EXHIBIT_PROFILES`).toBe(true);
    }

    const dtSec =
      RECOIL_WAVEFORM_WINDOW_MS / (RECOIL_WAVEFORM_SAMPLES - 1) / 1000;

    for (const id of WEAPON_IDS) {
      const res = evaluateRecoilDynamics(id);
      expect(Number.isFinite(res.totalImpulseNs)).toBe(true);
      expect(res.totalImpulseNs).toBeGreaterThan(0);
      expect(Number.isFinite(res.freeRecoilEnergyJ)).toBe(true);
      expect(res.freeRecoilEnergyJ).toBeGreaterThanOrEqual(0);
      expect(res.freeRecoilVelocityMps).toBeGreaterThan(0);
      expect(res.peakFeltForceN).toBeGreaterThan(0);
      expect(res.muzzleClimbTorqueNm).toBeGreaterThan(0);
      expect(res.waveform).toHaveLength(RECOIL_WAVEFORM_SAMPLES);
      expect(res.waveform[0].tMs).toBe(0);
      expect(res.waveform[res.waveform.length - 1].tMs).toBe(
        RECOIL_WAVEFORM_WINDOW_MS
      );

      // Verify Riemann integral of F(t) waveform conserves exact impulse
      const integratedImpulse = res.waveform.reduce(
        (acc, s) => acc + s.forceN * dtSec,
        0
      );
      expect(integratedImpulse / res.totalImpulseNs).toBeCloseTo(1.0, 1);
    }
  });

  it('proves muzzle brake & suppressor meaningfully lower impulse/energy and buffer conserves impulse while cutting peak force', () => {
    const rawM82 = evaluateRecoilDynamics('m82a1', { muzzleDevice: 'raw' });
    const brakeM82 = evaluateRecoilDynamics('m82a1', { muzzleDevice: 'brake' });
    const suppM82 = evaluateRecoilDynamics('m82a1', {
      muzzleDevice: 'suppressor',
    });

    expect(brakeM82.muzzleCounterThrustNs).toBeGreaterThan(0);
    expect(brakeM82.totalImpulseNs).toBeLessThan(rawM82.totalImpulseNs * 0.85);
    expect(brakeM82.freeRecoilEnergyJ).toBeLessThan(
      rawM82.freeRecoilEnergyJ * 0.72
    );

    expect(suppM82.totalImpulseNs).toBeLessThan(rawM82.totalImpulseNs);
    expect(suppM82.peakFeltForceN).toBeLessThan(rawM82.peakFeltForceN * 0.78);

    // Platform buffer conserves total impulse while reducing peak force & climb torque
    const unbufferedAk = evaluateRecoilDynamics('ak15', {
      muzzleDevice: 'raw',
      bufferEnabled: false,
    });
    const bufferedAk = evaluateRecoilDynamics('ak15', {
      muzzleDevice: 'raw',
      bufferEnabled: true,
    });
    expect(bufferedAk.totalImpulseNs).toBeCloseTo(
      unbufferedAk.totalImpulseNs,
      3
    );
    expect(bufferedAk.peakFeltForceN).toBeLessThan(
      unbufferedAk.peakFeltForceN * 0.82
    );
    expect(bufferedAk.muzzleClimbTorqueNm).toBeLessThan(
      unbufferedAk.muzzleClimbTorqueNm * 0.82
    );
  });

  it('verifies KRISS Vector ultra-low climb torque vs Desert Eagle/Thompson, GAU-8 40-48 kN sustained thrust, and 0 gas-jet on compound archery', () => {
    const vector = evaluateRecoilDynamics('vector', { muzzleDevice: 'factory' });
    const deagle = evaluateRecoilDynamics('deagle', { muzzleDevice: 'factory' });
    const thompson = evaluateRecoilDynamics('thompson', {
      muzzleDevice: 'factory',
    });

    expect(vector.boreAxisMm).toBe(16);
    expect(deagle.boreAxisMm).toBe(44);
    expect(vector.muzzleClimbTorqueNm).toBeLessThan(deagle.muzzleClimbTorqueNm);
    expect(vector.muzzleClimbTorqueNm).toBeLessThan(
      thompson.muzzleClimbTorqueNm
    );

    // GAU-8/A Avenger 3,900 RPM sustained rotary thrust (~44.5-46.4 kN)
    const gau8Factory = evaluateRecoilDynamics('gau8', {
      muzzleDevice: 'factory',
    });
    expect(gau8Factory.sustainedThrustKn).toBeGreaterThanOrEqual(40);
    expect(gau8Factory.sustainedThrustKn).toBeLessThanOrEqual(48);

    // ZTZ-99A 125mm huge impulse absorbed by 55 t MBT platform
    const ztz = evaluateRecoilDynamics('ztz99a');
    expect(ztz.totalImpulseNs).toBeGreaterThan(10000);
    expect(ztz.freeRecoilVelocityMps).toBeLessThan(1.0);

    // Compound archery has strictly 0 propellant gas-jet momentum
    for (const archId of ['lift33', 'r500'] as const) {
      const arch = evaluateRecoilDynamics(archId, { muzzleDevice: 'brake' });
      expect(arch.rawGasJetMomentumNs).toBe(0);
      expect(arch.netGasJetMomentumNs).toBe(0);
      expect(arch.muzzleCounterThrustNs).toBe(0);
      expect(arch.totalImpulseNs).toBeCloseTo(arch.projectileMomentumNs, 3);
    }

    // Formatters sanity
    expect(formatForceValue(850)).toBe('850 N');
    expect(formatForceValue(45500)).toBe('45.5 kN');
    expect(formatImpulse(12.34)).toBe('12.34 N·s');
    expect(formatTorque(28.4)).toBe('28.4 N·m');
    expect(formatRecoilEnergy(18.5)).toBe('18.5 J');
  });

  it('ships 5 iconic matchup presets, 100% bilingual strings (0 CJK in EN, 0 WP-XX), and accessible RecoilLabModal SSR markup', () => {
    expect(RECOIL_MATCHUP_PRESETS).toHaveLength(5);
    expect(RECOIL_MATCHUP_PRESETS.map((p) => p.id)).toEqual([
      'vector_vs_thompson',
      'm1911_vs_g17',
      'm82a1_vs_awm',
      'gau8_vs_ztz99a',
      'ak15_vs_m4a1',
    ]);

    for (const preset of RECOIL_MATCHUP_PRESETS) {
      expect(preset.titleEn).not.toMatch(CJK_RE);
      expect(preset.insightEn).not.toMatch(CJK_RE);
      expect(preset.titleEn).not.toMatch(WP_BADGE_RE);
      expect(preset.titleZh).not.toMatch(WP_BADGE_RE);
    }

    expect(Object.keys(RECOIL_LAB_STRINGS.en).sort()).toEqual(
      Object.keys(RECOIL_LAB_STRINGS.zh).sort()
    );
    for (const s of collectStrings(RECOIL_LAB_STRINGS.en)) {
      expect(s, `RECOIL_LAB_STRINGS.en leaked CJK: ${s}`).not.toMatch(CJK_RE);
      expect(s, `RECOIL_LAB_STRINGS.en leaked WP-XX: ${s}`).not.toMatch(
        WP_BADGE_RE
      );
    }
    for (const s of collectStrings(RECOIL_LAB_STRINGS.zh)) {
      expect(s, `RECOIL_LAB_STRINGS.zh leaked WP-XX: ${s}`).not.toMatch(
        WP_BADGE_RE
      );
    }

    const html = renderToStaticMarkup(
      React.createElement(RecoilLabModal, {
        initialPresetId: 'gau8_vs_ztz99a',
        onClose: () => {},
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('data-testid="recoil-lab-modal"');
    expect(html).toContain('data-testid="recoil-waveform-svg"');
    expect(html).toContain('data-testid="recoil-lever-svg"');
    expect(html).toContain('data-testid="recoil-momentum-bars"');
    expect(html).toContain('data-testid="recoil-split3d-btn"');
    expect(html).toContain('data-testid="recoil-inspect-a"');
    expect(html).toContain('data-testid="recoil-inspect-b"');
    for (const preset of RECOIL_MATCHUP_PRESETS) {
      expect(html).toContain(`data-testid="recoil-preset-${preset.id}"`);
    }
    expect(html).not.toMatch(WP_BADGE_RE);

    const modalSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/recoillab/RecoilLabModal.tsx'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/recoil-lab.css'),
      'utf8'
    );
    expect(modalSrc).toContain('useDialogAccessibility');
    expect(cssSrc).toContain("[data-theme='light']");
    expect(cssSrc).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssSrc).toContain('@media (max-width: 768px)');
    expect(cssSrc).not.toMatch(WP_BADGE_RE);
  });
});

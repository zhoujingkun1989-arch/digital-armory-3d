import type { GtaoQualityMode } from './ArmoryPostProcessing';

export type GraphicsQualityTier = 'ultra' | 'balanced' | 'eco';

export const GRAPHICS_QUALITY_TIERS: readonly GraphicsQualityTier[] = [
  'ultra',
  'balanced',
  'eco',
];

export interface GraphicsQualityProfile {
  tier: GraphicsQualityTier;
  maxDpr: number;
  shadowMapSize: number;
  gtaoEnabled: boolean;
  gtaoQuality: GtaoQualityMode;
  bloomEnabled: boolean;
  smaaEnabled: boolean;
  macroDofCapable: boolean;
  filmicLensEnabled: boolean;
  contactShadowsEnabled: boolean;
  contactShadowResolution: number;
}

export const GRAPHICS_QUALITY_PROFILES: Readonly<
  Record<GraphicsQualityTier, GraphicsQualityProfile>
> = {
  ultra: {
    tier: 'ultra',
    maxDpr: 2,
    shadowMapSize: 2048,
    gtaoEnabled: true,
    gtaoQuality: 'adaptive',
    bloomEnabled: true,
    smaaEnabled: true,
    macroDofCapable: true,
    filmicLensEnabled: true,
    contactShadowsEnabled: true,
    contactShadowResolution: 512,
  },
  balanced: {
    tier: 'balanced',
    maxDpr: 1.5,
    shadowMapSize: 1024,
    gtaoEnabled: true,
    gtaoQuality: 'half',
    bloomEnabled: true,
    smaaEnabled: true,
    macroDofCapable: false,
    filmicLensEnabled: true,
    contactShadowsEnabled: true,
    contactShadowResolution: 256,
  },
  eco: {
    tier: 'eco',
    maxDpr: 1.25,
    shadowMapSize: 1024,
    gtaoEnabled: false,
    gtaoQuality: 'half',
    bloomEnabled: false,
    smaaEnabled: false,
    macroDofCapable: false,
    filmicLensEnabled: false,
    contactShadowsEnabled: false,
    contactShadowResolution: 256,
  },
};

export function getGraphicsQualityProfile(
  tier: GraphicsQualityTier
): GraphicsQualityProfile {
  return GRAPHICS_QUALITY_PROFILES[tier] ?? GRAPHICS_QUALITY_PROFILES.ultra;
}

export interface GraphicsQualityTelemetryMeta {
  tier: GraphicsQualityTier;
  maxDpr: number;
  shadowMapSize: number;
  gtaoQuality: GtaoQualityMode;
  macroDofCapable: boolean;
  enabledPostfxPasses: number;
}

/**
 * Computes the count of optional post-processing passes active for a given quality profile
 * (GTAO, Bloom, Macro DoF, Filmic Lens, SMAA) so telemetry HUDs & tests can inspect tier budgets.
 */
export function computeEffectivePostfxPassCount(
  profile: GraphicsQualityProfile
): number {
  let count = 0;
  if (profile.gtaoEnabled) count += 1;
  if (profile.bloomEnabled) count += 1;
  if (profile.macroDofCapable) count += 1;
  if (profile.filmicLensEnabled) count += 1;
  if (profile.smaaEnabled) count += 1;
  return count;
}

export function getGraphicsQualityTelemetryMeta(
  tier: GraphicsQualityTier
): GraphicsQualityTelemetryMeta {
  const profile = getGraphicsQualityProfile(tier);
  return {
    tier: profile.tier,
    maxDpr: profile.maxDpr,
    shadowMapSize: profile.shadowMapSize,
    gtaoQuality: profile.gtaoQuality,
    macroDofCapable: profile.macroDofCapable,
    enabledPostfxPasses: computeEffectivePostfxPassCount(profile),
  };
}

/**
 * Selects the default hardware-appropriate graphics quality tier:
 * Desktop / Mac defaults to `'ultra'` photorealistic studio quality; coarse-pointer mobile
 * devices start on `'balanced'` to guarantee silky interactive framerates.
 */
export function detectDefaultGraphicsQuality(): GraphicsQualityTier {
  if (typeof window === 'undefined') return 'ultra';
  const coarsePointer = Boolean(
    window.matchMedia?.('(pointer: coarse)').matches
  );
  const narrowScreen = window.innerWidth > 0 && window.innerWidth < 820;
  return coarsePointer && narrowScreen ? 'balanced' : 'ultra';
}

export function stepDownGraphicsQuality(
  tier: GraphicsQualityTier
): GraphicsQualityTier | null {
  if (tier === 'ultra') return 'balanced';
  if (tier === 'balanced') return 'eco';
  return null;
}

export interface FpsWatchdogState {
  accumulatedSec: number;
  frameCount: number;
  lowFpsStrikes: number;
}

export function createFpsWatchdogState(): FpsWatchdogState {
  return {
    accumulatedSec: 0,
    frameCount: 0,
    lowFpsStrikes: 0,
  };
}

/**
 * Evaluates rolling framerate in Zero-GC `useFrame` loops. Ignores background-tab pause spikes
 * (`dt > 0.25 s`). Returns `true` when sustained FPS remains below `lowFpsThreshold` (default 22 FPS)
 * for 3 consecutive 1.2-second windows (~3.6 seconds of genuine GPU strain).
 */
export function updateFpsWatchdog(
  state: FpsWatchdogState,
  deltaSec: number,
  lowFpsThreshold = 22
): boolean {
  if (!(deltaSec > 0) || deltaSec > 0.25) return false;
  state.accumulatedSec += deltaSec;
  state.frameCount += 1;

  if (state.accumulatedSec < 1.2) return false;

  const avgFps = state.frameCount / state.accumulatedSec;
  state.accumulatedSec = 0;
  state.frameCount = 0;

  if (avgFps < lowFpsThreshold) {
    state.lowFpsStrikes += 1;
    if (state.lowFpsStrikes >= 3) {
      state.lowFpsStrikes = 0;
      return true;
    }
  } else {
    state.lowFpsStrikes = 0;
  }
  return false;
}

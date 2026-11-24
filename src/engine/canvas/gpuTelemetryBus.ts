/**
 * Zero-Overhead Real-Time GPU & Memory Telemetry Bus
 * ------------------------------------------------------------------
 * Pure transient pub/sub channel bridging WebGLRenderer frame metrics
 * (`gl.info.render` / `gl.info.memory` + frame delta ms) to optional HUD
 * overlays without touching React/Zustand state at 60Hz.
 *
 * Performance invariants:
 * - When `telemetryEnabled === false` (default), `publishGpuTelemetrySample`
 *   returns `false` on line 1 with zero math, zero array writes, and zero GC.
 * - Ring buffer (`Float64Array`) and sort scratch buffer are pre-allocated once
 *   at module load; frame publishing performs zero heap allocations.
 * - Subscriber notifications are throttled (`emitIntervalMs`, default 250ms)
 *   so HUD overlays re-render at <= 4 Hz while `getGpuTelemetrySnapshot()`
 *   always reflects exact up-to-date ring statistics on demand.
 */

export const GPU_TELEMETRY_RING_SIZE = 60;
export const GPU_TELEMETRY_DEFAULT_EMIT_INTERVAL_MS = 250;

export interface GpuTelemetrySampleInput {
  /** Frame delta duration in milliseconds (e.g. `delta * 1000`). */
  frameMs: number;
  /** `gl.info.render.calls` */
  drawCalls: number;
  /** `gl.info.render.triangles` */
  triangles: number;
  /** `gl.info.memory.geometries` */
  geometries: number;
  /** `gl.info.memory.textures` */
  textures: number;
  /** `gl.info.programs?.length` (optional). */
  programs?: number;
  /** Optional monotonic timestamp in milliseconds (defaults to `performance.now()`). */
  nowMs?: number;
}

export interface GpuTelemetrySnapshot {
  enabled: boolean;
  sampleCount: number;
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  updatedAtMs: number;
}

export type GpuTelemetryListener = (
  snapshot: Readonly<GpuTelemetrySnapshot>
) => void;

const frameRing = new Float64Array(GPU_TELEMETRY_RING_SIZE);
const sortScratch = new Float64Array(GPU_TELEMETRY_RING_SIZE);

let telemetryEnabled = false;
let ringHead = 0;
let ringCount = 0;
let statsDirty = false;
let lastNotifyMs = -Infinity;

const listeners = new Set<GpuTelemetryListener>();

const liveSnapshot: GpuTelemetrySnapshot = {
  enabled: false,
  sampleCount: 0,
  fps: 0,
  frameMs: 0,
  avgFrameMs: 0,
  p95FrameMs: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  updatedAtMs: 0,
};

function sanitizeNonNegativeInt(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

function sanitizeFrameMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.1;
  if (value > 1000) return 1000;
  return value;
}

function getMonotonicNowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Zero-GC recomputation of average frame time, FPS, and P95 frame time
 * using in-place insertion sort on pre-allocated `sortScratch`.
 */
function recomputeRingStats(): void {
  if (ringCount <= 0) {
    liveSnapshot.avgFrameMs = 0;
    liveSnapshot.fps = 0;
    liveSnapshot.p95FrameMs = 0;
    statsDirty = false;
    return;
  }

  let sum = 0;
  for (let i = 0; i < ringCount; i += 1) {
    const v = frameRing[i];
    sum += v;
    // Insertion sort into pre-allocated scratch buffer (n <= 60, zero allocations)
    let j = i - 1;
    while (j >= 0 && sortScratch[j] > v) {
      sortScratch[j + 1] = sortScratch[j];
      j -= 1;
    }
    sortScratch[j + 1] = v;
  }

  const avg = sum / ringCount;
  const p95Idx = Math.min(ringCount - 1, Math.max(0, Math.ceil(ringCount * 0.95) - 1));
  const p95 = sortScratch[p95Idx];

  liveSnapshot.avgFrameMs = avg;
  liveSnapshot.fps = avg > 0 ? 1000 / avg : 0;
  liveSnapshot.p95FrameMs = p95;
  statsDirty = false;
}

export function isGpuTelemetryEnabled(): boolean {
  return telemetryEnabled;
}

export function setGpuTelemetryEnabled(enabled: boolean): void {
  const next = Boolean(enabled);
  if (telemetryEnabled === next) return;
  telemetryEnabled = next;
  liveSnapshot.enabled = next;
  if (next) {
    // Allow immediate first notification after enabling
    lastNotifyMs = -Infinity;
  }
}

export function getGpuTelemetrySubscriberCount(): number {
  return listeners.size;
}

/**
 * Publishes one frame telemetry sample from a `useFrame` render loop.
 * Strictly a zero-cost no-op (returns `false`) whenever telemetry is disabled.
 */
export function publishGpuTelemetrySample(
  sample: GpuTelemetrySampleInput,
  emitIntervalMs: number = GPU_TELEMETRY_DEFAULT_EMIT_INTERVAL_MS
): boolean {
  if (!telemetryEnabled) {
    return false;
  }

  const frameMs = sanitizeFrameMs(sample.frameMs);
  const nowMs =
    typeof sample.nowMs === 'number' && Number.isFinite(sample.nowMs)
      ? sample.nowMs
      : getMonotonicNowMs();

  frameRing[ringHead] = frameMs;
  ringHead = (ringHead + 1) % GPU_TELEMETRY_RING_SIZE;
  if (ringCount < GPU_TELEMETRY_RING_SIZE) {
    ringCount += 1;
  }

  liveSnapshot.enabled = true;
  liveSnapshot.sampleCount += 1;
  liveSnapshot.frameMs = frameMs;
  liveSnapshot.drawCalls = sanitizeNonNegativeInt(sample.drawCalls);
  liveSnapshot.triangles = sanitizeNonNegativeInt(sample.triangles);
  liveSnapshot.geometries = sanitizeNonNegativeInt(sample.geometries);
  liveSnapshot.textures = sanitizeNonNegativeInt(sample.textures);
  if (sample.programs !== undefined) {
    liveSnapshot.programs = sanitizeNonNegativeInt(sample.programs);
  }
  liveSnapshot.updatedAtMs = nowMs;
  statsDirty = true;

  if (
    listeners.size > 0 &&
    (emitIntervalMs <= 0 || nowMs - lastNotifyMs >= emitIntervalMs)
  ) {
    recomputeRingStats();
    lastNotifyMs = nowMs;
    for (const listener of listeners) {
      listener(liveSnapshot);
    }
  }

  return true;
}

/**
 * Returns the latest telemetry snapshot (computing lazy ring stats if dirty).
 */
export function getGpuTelemetrySnapshot(): Readonly<GpuTelemetrySnapshot> {
  if (statsDirty) {
    recomputeRingStats();
  }
  return liveSnapshot;
}

/**
 * Subscribes a listener to throttled telemetry updates. Returns an unsubscribe fn.
 */
export function subscribeGpuTelemetry(
  listener: GpuTelemetryListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resets ring buffers, counters, listeners, and disabled flag (for tests & teardown).
 */
export function resetGpuTelemetryBus(): void {
  telemetryEnabled = false;
  ringHead = 0;
  ringCount = 0;
  statsDirty = false;
  lastNotifyMs = -Infinity;
  frameRing.fill(0);
  sortScratch.fill(0);
  listeners.clear();

  liveSnapshot.enabled = false;
  liveSnapshot.sampleCount = 0;
  liveSnapshot.fps = 0;
  liveSnapshot.frameMs = 0;
  liveSnapshot.avgFrameMs = 0;
  liveSnapshot.p95FrameMs = 0;
  liveSnapshot.drawCalls = 0;
  liveSnapshot.triangles = 0;
  liveSnapshot.geometries = 0;
  liveSnapshot.textures = 0;
  liveSnapshot.programs = 0;
  liveSnapshot.updatedAtMs = 0;
}

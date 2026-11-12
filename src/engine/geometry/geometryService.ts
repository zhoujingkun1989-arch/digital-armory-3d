import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { loadWeaponGeometryBuilders } from '../../weapons/geometryLoaders';
import type { WeaponId, WeaponPartSpec } from '../../weapons/types';
import { isWeaponId } from '../../weapons/types';
import type {
  GeometryWorkerRequest,
  GeometryWorkerResponse,
  SerializedPartGeometry,
} from './geometry.worker';

/** Maximum number of full 26-part weapon CSG sets retained in GPU VRAM before LRU `.dispose()` */
const MAX_CACHED_WEAPONS = 6;

interface WeaponGeometryPoolEntry {
  parts: Map<string, THREE.BufferGeometry>;
  centers: Map<string, [number, number, number]>;
  ready: number;
  total: number;
  isBuilding: boolean;
}

const weaponPools = new Map<WeaponId, WeaponGeometryPoolEntry>();
const lruOrder: WeaponId[] = [];
const inflightPromises = new Map<WeaponId, Promise<void>>();
const statusListeners = new Set<(weaponId: WeaponId) => void>();

let workerInstance: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pendingWorkerResolvers = new Map<
  number,
  { resolve: () => void; reject: (err: Error) => void }
>();

function notifyGeometryStatus(weaponId: WeaponId): void {
  statusListeners.forEach((fn) => fn(weaponId));
}

export function subscribeGeometryStatus(
  listener: (weaponId: WeaponId) => void
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function touchLru(weaponId: WeaponId): void {
  const idx = lruOrder.indexOf(weaponId);
  if (idx !== -1) {
    lruOrder.splice(idx, 1);
  }
  lruOrder.push(weaponId);

  while (lruOrder.length > MAX_CACHED_WEAPONS) {
    const candidate = lruOrder[0];
    const entry = weaponPools.get(candidate);
    if (entry?.isBuilding) {
      // Never evict a weapon while its worker build is still streaming
      break;
    }
    lruOrder.shift();
    if (entry) {
      entry.parts.forEach((geo) => geo.dispose());
      entry.parts.clear();
      entry.centers.clear();
      weaponPools.delete(candidate);
    }
  }
}

function reconstructBufferGeometry(
  item: SerializedPartGeometry
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(item.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(item.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(item.uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(item.color, 3));
  if (item.index) {
    geo.setIndex(new THREE.BufferAttribute(item.index, 1));
  }
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(...item.bboxMin),
    new THREE.Vector3(...item.bboxMax)
  );
  geo.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(item.bsphere[0], item.bsphere[1], item.bsphere[2]),
    item.bsphere[3]
  );
  return geo;
}

function recordBuiltGeometry(
  entry: WeaponGeometryPoolEntry,
  partId: string,
  geo: THREE.BufferGeometry
): void {
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingSphere) geo.computeBoundingSphere();

  const existing = entry.parts.get(partId);
  if (existing && existing !== geo) {
    existing.dispose();
  }
  entry.parts.set(partId, geo);

  const box = geo.boundingBox!;
  entry.centers.set(partId, [
    (box.min.x + box.max.x) * 0.5,
    (box.min.y + box.max.y) * 0.5,
    (box.min.z + box.max.z) * 0.5,
  ]);
}

function getOrCreateWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;

  try {
    const w = new Worker(new URL('./geometry.worker.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (ev: MessageEvent<GeometryWorkerResponse>) => {
      const msg = ev.data;
      if (!msg) return;

      const entry = weaponPools.get(msg.weaponId);
      if (msg.type === 'part-batch' && entry) {
        for (let i = 0; i < msg.batch.length; i++) {
          const item = msg.batch[i];
          const geo = reconstructBufferGeometry(item);
          recordBuiltGeometry(entry, item.partId, geo);
        }
        entry.ready = entry.parts.size;
        entry.total = msg.total;
        notifyGeometryStatus(msg.weaponId);
      } else if (msg.type === 'weapon-complete') {
        if (entry) {
          entry.isBuilding = false;
          entry.ready = entry.parts.size;
          touchLru(msg.weaponId);
          notifyGeometryStatus(msg.weaponId);
        }
        const pending = pendingWorkerResolvers.get(msg.requestId);
        if (pending) {
          pendingWorkerResolvers.delete(msg.requestId);
          pending.resolve();
        }
      } else if (msg.type === 'weapon-error') {
        if (entry) {
          entry.isBuilding = false;
          notifyGeometryStatus(msg.weaponId);
        }
        const pending = pendingWorkerResolvers.get(msg.requestId);
        if (pending) {
          pendingWorkerResolvers.delete(msg.requestId);
          pending.reject(new Error(msg.message));
        }
      }
    };

    w.onerror = () => {
      workerUnavailable = true;
      workerInstance = null;
    };

    workerInstance = w;
    return w;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

async function buildOnMainThreadSliced(
  weaponId: WeaponId,
  partIds: string[],
  entry: WeaponGeometryPoolEntry
): Promise<void> {
  const builders = await loadWeaponGeometryBuilders(weaponId);
  const total = partIds.length;
  const SLICE = 3;

  for (let i = 0; i < total; i += SLICE) {
    const end = Math.min(total, i + SLICE);
    for (let j = i; j < end; j++) {
      const partId = partIds[j];
      if (entry.parts.has(partId)) continue;
      const fn = builders[partId];
      const geo = fn ? fn() : new THREE.BoxGeometry(0.5, 0.5, 0.5);
      recordBuiltGeometry(entry, partId, geo);
    }
    entry.ready = entry.parts.size;
    notifyGeometryStatus(weaponId);
    if (end < total) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  entry.isBuilding = false;
  touchLru(weaponId);
  notifyGeometryStatus(weaponId);
}

/**
 * Ensures all CSG geometries for `weaponId` are built in the background Web Worker
 * (with automatic sliced main-thread fallback) and cached in the bounded GPU LRU pool.
 */
export function ensureWeaponGeometries(
  weaponIdRaw: string,
  partIds: readonly string[]
): Promise<void> {
  const weaponId: WeaponId = isWeaponId(weaponIdRaw) ? weaponIdRaw : 'ak15';
  const existingEntry = weaponPools.get(weaponId);
  if (
    existingEntry &&
    !existingEntry.isBuilding &&
    existingEntry.parts.size >= partIds.length
  ) {
    touchLru(weaponId);
    return Promise.resolve();
  }

  const inflight = inflightPromises.get(weaponId);
  if (inflight) return inflight;

  const entry: WeaponGeometryPoolEntry = existingEntry ?? {
    parts: new Map(),
    centers: new Map(),
    ready: 0,
    total: partIds.length,
    isBuilding: true,
  };
  entry.total = partIds.length;
  entry.isBuilding = true;
  weaponPools.set(weaponId, entry);
  touchLru(weaponId);
  notifyGeometryStatus(weaponId);

  const missingIds = partIds.filter((id) => !entry.parts.has(id));
  if (missingIds.length === 0) {
    entry.isBuilding = false;
    entry.ready = entry.parts.size;
    notifyGeometryStatus(weaponId);
    return Promise.resolve();
  }

  const worker = getOrCreateWorker();
  let buildPromise: Promise<void>;

  if (worker) {
    const requestId = nextRequestId++;
    buildPromise = new Promise<void>((resolve, reject) => {
      pendingWorkerResolvers.set(requestId, { resolve, reject });
      const req: GeometryWorkerRequest = {
        type: 'build-weapon',
        requestId,
        weaponId,
        partIds: missingIds,
      };
      worker.postMessage(req);
    }).catch(() => buildOnMainThreadSliced(weaponId, missingIds, entry));
  } else {
    buildPromise = buildOnMainThreadSliced(weaponId, missingIds, entry);
  }

  const tracked = buildPromise.finally(() => {
    inflightPromises.delete(weaponId);
  });
  inflightPromises.set(weaponId, tracked);
  return tracked;
}

export function getCachedPartGeometry(
  weaponIdRaw: string,
  partId: string
): THREE.BufferGeometry | null {
  if (!isWeaponId(weaponIdRaw)) return null;
  return weaponPools.get(weaponIdRaw)?.parts.get(partId) ?? null;
}

export function getPartLocalCenter(
  weaponIdRaw: string,
  partId: string
): [number, number, number] {
  if (!isWeaponId(weaponIdRaw)) return [0, 0, 0];
  return weaponPools.get(weaponIdRaw)?.centers.get(partId) ?? [0, 0, 0];
}

export interface WeaponGeometryStatus {
  readyCount: number;
  totalCount: number;
  isBuilding: boolean;
  version: number;
}

export function getWeaponGeometrySnapshot(
  weaponIdRaw: string,
  expectedTotal = 0
): Omit<WeaponGeometryStatus, 'version'> {
  if (!isWeaponId(weaponIdRaw)) {
    return { readyCount: 0, totalCount: expectedTotal, isBuilding: false };
  }
  const entry = weaponPools.get(weaponIdRaw);
  if (!entry) {
    return { readyCount: 0, totalCount: expectedTotal, isBuilding: false };
  }
  return {
    readyCount: entry.parts.size,
    totalCount: entry.total || expectedTotal,
    isBuilding: entry.isBuilding,
  };
}

/**
 * React hook triggering background CSG mesh generation for `weaponId` and returning
 * streaming build status (`readyCount`, `totalCount`, `isBuilding`).
 */
export function useWeaponGeometries(
  weaponId: string,
  parts: readonly WeaponPartSpec[] | null
): WeaponGeometryStatus {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!parts || parts.length === 0) return;
    void ensureWeaponGeometries(
      weaponId,
      parts.map((p) => p.id)
    );
  }, [weaponId, parts]);

  useEffect(() => {
    return subscribeGeometryStatus((changedWeaponId) => {
      if (changedWeaponId === weaponId) {
        setVersion((v) => v + 1);
      }
    });
  }, [weaponId]);

  const snap = getWeaponGeometrySnapshot(weaponId, parts?.length ?? 0);
  return {
    ...snap,
    version,
  };
}

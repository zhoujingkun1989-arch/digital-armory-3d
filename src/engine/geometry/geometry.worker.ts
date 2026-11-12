import * as THREE from 'three';
import { loadWeaponGeometryBuilders } from '../../weapons/geometryLoaders';
import type { WeaponId } from '../../weapons/types';

export interface SerializedPartGeometry {
  partId: string;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  index: Uint16Array | Uint32Array | null;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  bsphere: [number, number, number, number];
}

export interface GeometryWorkerRequest {
  type: 'build-weapon';
  requestId: number;
  weaponId: WeaponId;
  partIds: string[];
}

export type GeometryWorkerResponse =
  | {
      type: 'part-batch';
      requestId: number;
      weaponId: WeaponId;
      ready: number;
      total: number;
      batch: SerializedPartGeometry[];
    }
  | {
      type: 'weapon-complete';
      requestId: number;
      weaponId: WeaponId;
      total: number;
    }
  | {
      type: 'weapon-error';
      requestId: number;
      weaponId: WeaponId;
      message: string;
    };

function toOwnedFloat32(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  fallbackCount: number,
  itemSize: number
): Float32Array {
  if (!attr || !('array' in attr)) {
    return new Float32Array(fallbackCount * itemSize);
  }
  const src = attr.array;
  if (
    src instanceof Float32Array &&
    src.byteOffset === 0 &&
    src.byteLength === src.buffer.byteLength
  ) {
    return src;
  }
  return new Float32Array(src);
}

function toOwnedIndex(
  indexAttr: THREE.BufferAttribute | null
): Uint16Array | Uint32Array | null {
  if (!indexAttr) return null;
  const src = indexAttr.array;
  if (
    (src instanceof Uint16Array || src instanceof Uint32Array) &&
    src.byteOffset === 0 &&
    src.byteLength === src.buffer.byteLength
  ) {
    return src;
  }
  return src instanceof Uint32Array
    ? new Uint32Array(src)
    : new Uint16Array(src);
}

function serializeGeometry(
  partId: string,
  geo: THREE.BufferGeometry,
  transferList: Transferable[]
): SerializedPartGeometry {
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundingSphere) geo.computeBoundingSphere();

  const vertCount = geo.attributes.position?.count ?? 0;
  const position = toOwnedFloat32(geo.attributes.position, vertCount, 3);
  const normal = toOwnedFloat32(geo.attributes.normal, vertCount, 3);
  const uv = toOwnedFloat32(geo.attributes.uv, vertCount, 2);
  const color = toOwnedFloat32(geo.attributes.color, vertCount, 3);
  const index = toOwnedIndex(geo.index);

  const b = geo.boundingBox ?? new THREE.Box3();
  const s = geo.boundingSphere ?? new THREE.Sphere();

  const bboxMin: [number, number, number] = [b.min.x, b.min.y, b.min.z];
  const bboxMax: [number, number, number] = [b.max.x, b.max.y, b.max.z];
  const bsphere: [number, number, number, number] = [
    s.center.x,
    s.center.y,
    s.center.z,
    s.radius,
  ];

  const seenBuffers = new Set<ArrayBuffer>([
    position.buffer as ArrayBuffer,
    normal.buffer as ArrayBuffer,
    uv.buffer as ArrayBuffer,
    color.buffer as ArrayBuffer,
  ]);
  if (index) {
    seenBuffers.add(index.buffer as ArrayBuffer);
  }
  seenBuffers.forEach((buf) => transferList.push(buf));

  geo.dispose();

  return {
    partId,
    position,
    normal,
    uv,
    color,
    index,
    bboxMin,
    bboxMax,
    bsphere,
  };
}

const BATCH_SIZE = 4;

interface DedicatedWorkerScope {
  onmessage: ((ev: MessageEvent<GeometryWorkerRequest>) => void) | null;
  postMessage: (
    message: GeometryWorkerResponse,
    transfer?: Transferable[]
  ) => void;
}

const workerScope = self as unknown as DedicatedWorkerScope;

workerScope.onmessage = async (ev: MessageEvent<GeometryWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'build-weapon') return;

  const { requestId, weaponId, partIds } = msg;
  try {
    const builders = await loadWeaponGeometryBuilders(weaponId);
    const total = partIds.length;
    let ready = 0;
    let batch: SerializedPartGeometry[] = [];
    let transfers: Transferable[] = [];

    for (let i = 0; i < total; i++) {
      const partId = partIds[i];
      const buildFn = builders[partId];
      const geo = buildFn ? buildFn() : new THREE.BoxGeometry(0.5, 0.5, 0.5);
      batch.push(serializeGeometry(partId, geo, transfers));
      ready++;

      if (batch.length >= BATCH_SIZE || ready === total) {
        workerScope.postMessage(
          {
            type: 'part-batch',
            requestId,
            weaponId,
            ready,
            total,
            batch,
          },
          transfers
        );
        batch = [];
        transfers = [];
      }
    }

    workerScope.postMessage({
      type: 'weapon-complete',
      requestId,
      weaponId,
      total,
    });
  } catch (err) {
    workerScope.postMessage({
      type: 'weapon-error',
      requestId,
      weaponId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

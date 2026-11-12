import * as THREE from 'three';
import {
  buildAkBarrelGeometry,
  buildAkButtstockGeometry,
  buildAkCheekRiserGeometry,
  buildAkGasBlockGeometry,
  buildAkLowerHandguardGeometry,
  buildAkMuzzleDeviceGeometry,
  buildAkPistolGripGeometry,
  buildAkReceiverGeometry,
} from './meshes/ak15ReceiverGeometries';
import {
  buildAkBoltCarrierGeometry,
  buildAkBoltGeometry,
  buildAkDustCoverGeometry,
  buildAkExtractorGeometry,
  buildAkFiringPinGeometry,
  buildAkGasTubeGeometry,
  buildAkRearSightGeometry,
  buildAkRecoilGuideGeometry,
  buildAkRecoilSpringGeometry,
  buildAkUpperHandguardGeometry,
} from './meshes/ak15BoltAndUpperGeometries';
import {
  buildAkDisconnectorGeometry,
  buildAkHammerGeometry,
  buildAkMagBodyGeometry,
  buildAkMagFloorplateGeometry,
  buildAkMagFollowerGeometry,
  buildAkMagSpringGeometry,
  buildAkSelectorGeometry,
  buildAkTriggerGeometry,
} from './meshes/ak15FcgAndMagGeometries';

function sanitizeNonIndexedGeometry(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const norm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const col = g.getAttribute('color');
  const count = pos.count;

  let needsFilter = false;
  for (let i = 0; i + 2 < count; i += 3) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1) - ax;
    const by = pos.getY(i + 1) - ay;
    const bz = pos.getZ(i + 1) - az;
    const cx = pos.getX(i + 2) - ax;
    const cy = pos.getY(i + 2) - ay;
    const cz = pos.getZ(i + 2) - az;
    const fx = by * cz - bz * cy;
    const fy = bz * cx - bx * cz;
    const fz = bx * cy - by * cx;
    if (fx * fx + fy * fy + fz * fz < 1e-16) {
      needsFilter = true;
      break;
    }
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const nx = norm.getX(vi);
      const ny = norm.getY(vi);
      const nz = norm.getZ(vi);
      if (Math.abs(nx * nx + ny * ny + nz * nz - 1) > 1e-3) {
        needsFilter = true;
        break;
      }
    }
    if (needsFilter) break;
  }

  if (!needsFilter) {
    return g;
  }

  const validTris: number[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1) - ax;
    const by = pos.getY(i + 1) - ay;
    const bz = pos.getZ(i + 1) - az;
    const cx = pos.getX(i + 2) - ax;
    const cy = pos.getY(i + 2) - ay;
    const cz = pos.getZ(i + 2) - az;
    const fx = by * cz - bz * cy;
    const fy = bz * cx - bx * cz;
    const fz = bx * cy - by * cx;
    if (fx * fx + fy * fy + fz * fz >= 1e-16) {
      validTris.push(i);
    }
  }

  const outVerts = validTris.length * 3;
  const outPos = new Float32Array(outVerts * 3);
  const outNorm = new Float32Array(outVerts * 3);
  const outUv = new Float32Array(outVerts * 2);
  const colSize = col.itemSize;
  const outCol = new Float32Array(outVerts * colSize);

  let w = 0;
  for (const i of validTris) {
    const ax = pos.getX(i);
    const ay = pos.getY(i);
    const az = pos.getZ(i);
    const bx = pos.getX(i + 1) - ax;
    const by = pos.getY(i + 1) - ay;
    const bz = pos.getZ(i + 1) - az;
    const cx = pos.getX(i + 2) - ax;
    const cy = pos.getY(i + 2) - ay;
    const cz = pos.getZ(i + 2) - az;
    let fx = by * cz - bz * cy;
    let fy = bz * cx - bx * cz;
    let fz = bx * cy - by * cx;
    const fLen = Math.hypot(fx, fy, fz) || 1;
    fx /= fLen;
    fy /= fLen;
    fz /= fLen;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      outPos[w * 3] = pos.getX(vi);
      outPos[w * 3 + 1] = pos.getY(vi);
      outPos[w * 3 + 2] = pos.getZ(vi);

      let nx = norm.getX(vi);
      let ny = norm.getY(vi);
      let nz = norm.getZ(vi);
      const nLen = Math.hypot(nx, ny, nz);
      if (nLen > 1e-5) {
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
      } else {
        nx = fx;
        ny = fy;
        nz = fz;
      }
      outNorm[w * 3] = nx;
      outNorm[w * 3 + 1] = ny;
      outNorm[w * 3 + 2] = nz;

      outUv[w * 2] = uv.getX(vi);
      outUv[w * 2 + 1] = uv.getY(vi);

      for (let c = 0; c < colSize; c++) {
        outCol[w * colSize + c] = col.getComponent(vi, c);
      }
      w++;
    }
  }

  const clean = new THREE.BufferGeometry();
  clean.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  clean.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  clean.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  clean.setAttribute('color', new THREE.BufferAttribute(outCol, colSize));
  clean.computeBoundingBox();
  clean.computeBoundingSphere();
  g.dispose();
  return clean;
}

const RAW_AK15_BUILDERS: Record<string, () => THREE.BufferGeometry> = {
  // 1. Piston Bolt, Recoil & Upper Group (10)
  ak_dust_cover: buildAkDustCoverGeometry,
  ak_rear_sight: buildAkRearSightGeometry,
  ak_bolt_carrier: buildAkBoltCarrierGeometry,
  ak_bolt: buildAkBoltGeometry,
  ak_firing_pin: buildAkFiringPinGeometry,
  ak_extractor: buildAkExtractorGeometry,
  ak_recoil_guide: buildAkRecoilGuideGeometry,
  ak_recoil_spring: buildAkRecoilSpringGeometry,
  ak_upper_handguard: buildAkUpperHandguardGeometry,
  ak_gas_tube: buildAkGasTubeGeometry,

  // 2. Stamped Receiver, CHF Barrel & EVO Furniture (8)
  ak_receiver: buildAkReceiverGeometry,
  ak_barrel: buildAkBarrelGeometry,
  ak_muzzle_device: buildAkMuzzleDeviceGeometry,
  ak_gas_block: buildAkGasBlockGeometry,
  ak_lower_handguard: buildAkLowerHandguardGeometry,
  ak_buttstock: buildAkButtstockGeometry,
  ak_cheek_riser: buildAkCheekRiserGeometry,
  ak_pistol_grip: buildAkPistolGripGeometry,

  // 3. Hammer-Fired FCG & 2023 Ambi Selector (4)
  ak_hammer: buildAkHammerGeometry,
  ak_trigger: buildAkTriggerGeometry,
  ak_disconnector: buildAkDisconnectorGeometry,
  ak_selector: buildAkSelectorGeometry,

  // 4. 30-Rd 7.62×39mm Windowed Curved Magazine (4)
  ak_mag_body: buildAkMagBodyGeometry,
  ak_mag_follower: buildAkMagFollowerGeometry,
  ak_mag_spring: buildAkMagSpringGeometry,
  ak_mag_floorplate: buildAkMagFloorplateGeometry,
};

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  Object.fromEntries(
    Object.entries(RAW_AK15_BUILDERS).map(([id, fn]) => [
      id,
      () => sanitizeNonIndexedGeometry(fn()),
    ])
  );

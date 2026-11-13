import type * as THREE from 'three';
import type { WeaponId } from './types';
import { isWeaponId } from './types';

export type GeometryBuilderMap = Record<string, () => THREE.BufferGeometry>;

export const GEOMETRY_MODULE_LOADERS: Record<
  WeaponId,
  () => Promise<GeometryBuilderMap>
> = {
  ak15: () => import('./ak15/geometries').then((m) => m.GEOMETRY_BUILDERS),
  m4a1: () => import('./m4a1/geometries').then((m) => m.GEOMETRY_BUILDERS),
  mp5: () => import('./mp5/geometries').then((m) => m.GEOMETRY_BUILDERS),
  g17: () => import('./g17/geometries').then((m) => m.GEOMETRY_BUILDERS),
  m82a1: () => import('./m82a1/geometries').then((m) => m.GEOMETRY_BUILDERS),
  awm: () => import('./awm/geometries').then((m) => m.GEOMETRY_BUILDERS),
  scar: () => import('./scar/geometries').then((m) => m.GEOMETRY_BUILDERS),
  deagle: () => import('./deagle/geometries').then((m) => m.GEOMETRY_BUILDERS),
  aug: () => import('./aug/geometries').then((m) => m.GEOMETRY_BUILDERS),
  p320: () => import('./p320/geometries').then((m) => m.GEOMETRY_BUILDERS),
  p90: () => import('./p90/geometries').then((m) => m.GEOMETRY_BUILDERS),
};

export function loadWeaponGeometryBuilders(
  weaponId: string
): Promise<GeometryBuilderMap> {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';
  return GEOMETRY_MODULE_LOADERS[id]();
}

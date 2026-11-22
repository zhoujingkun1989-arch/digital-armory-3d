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
  lift33: () => import('./lift33/geometries').then((m) => m.GEOMETRY_BUILDERS),
  r500: () => import('./r500/geometries').then((m) => m.GEOMETRY_BUILDERS),
  python: () => import('./python/geometries').then((m) => m.GEOMETRY_BUILDERS),
  benellim4: () =>
    import('./benellim4/geometries').then((m) => m.GEOMETRY_BUILDERS),
  garand: () => import('./garand/geometries').then((m) => m.GEOMETRY_BUILDERS),
  m249: () => import('./m249/geometries').then((m) => m.GEOMETRY_BUILDERS),
  p08: () => import('./p08/geometries').then((m) => m.GEOMETRY_BUILDERS),
  vector: () => import('./vector/geometries').then((m) => m.GEOMETRY_BUILDERS),
  g11: () => import('./g11/geometries').then((m) => m.GEOMETRY_BUILDERS),
  vss: () => import('./vss/geometries').then((m) => m.GEOMETRY_BUILDERS),
  m134: () => import('./m134/geometries').then((m) => m.GEOMETRY_BUILDERS),
  an94: () => import('./an94/geometries').then((m) => m.GEOMETRY_BUILDERS),
  ztz99a: () => import('./ztz99a/geometries').then((m) => m.GEOMETRY_BUILDERS),
  m1a2: () => import('./m1a2/geometries').then((m) => m.GEOMETRY_BUILDERS),
  leopard2a7: () =>
    import('./leopard2a7/geometries').then((m) => m.GEOMETRY_BUILDERS),
  tiger1: () => import('./tiger1/geometries').then((m) => m.GEOMETRY_BUILDERS),
  winchester1894: () =>
    import('./winchester1894/geometries').then((m) => m.GEOMETRY_BUILDERS),
  rem870: () =>
    import('./rem870/geometries').then((m) => m.GEOMETRY_BUILDERS),
};

export function loadWeaponGeometryBuilders(
  weaponId: string
): Promise<GeometryBuilderMap> {
  const id: WeaponId = isWeaponId(weaponId) ? weaponId : 'ak15';
  return GEOMETRY_MODULE_LOADERS[id]();
}

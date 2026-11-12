import type * as THREE from 'three';
import { M82A1_GEOMETRY_BUILDERS } from './meshes/m82a1Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  M82A1_GEOMETRY_BUILDERS;

import type * as THREE from 'three';
import { P320_GEOMETRY_BUILDERS } from './meshes/p320Geometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  P320_GEOMETRY_BUILDERS;

import type * as THREE from 'three';
import { AWM_GEOMETRY_BUILDERS } from './meshes/awmGeometries';

export const GEOMETRY_BUILDERS: Record<string, () => THREE.BufferGeometry> =
  AWM_GEOMETRY_BUILDERS;

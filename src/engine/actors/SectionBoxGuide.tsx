import React from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Lightweight 3D wireframe bounding guide visualizing the active 6-plane
 * `SectionCutAxis === 'box'` CT slice volume inside Workbench.
 */
export const SectionBoxGuide: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
  const center = useAppStore((s) => s.sectionBoxCenter);
  const halfSize = useAppStore((s) => s.sectionBoxHalfSize);

  if (screen !== 'workbench' || !sectionCut || sectionCutAxis !== 'box') {
    return null;
  }

  return (
    <mesh
      position={[center[0], center[1], center[2]]}
      scale={[
        Math.max(0.2, halfSize[0] * 2),
        Math.max(0.2, halfSize[1] * 2),
        Math.max(0.2, halfSize[2] * 2),
      ]}
      raycast={() => null}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#14b8a6"
        wireframe
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </mesh>
  );
};

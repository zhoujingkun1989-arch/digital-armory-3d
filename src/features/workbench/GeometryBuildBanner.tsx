import React from 'react';
import { Cpu } from 'lucide-react';
import { useWeaponGeometries } from '../../engine/geometry/geometryService';
import { useAppStore } from '../../store/useAppStore';
import {
  getShortWeaponLabel,
  getWeaponManifest,
} from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';

export const GeometryBuildBanner: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const plugin = useWeaponPlugin(activeWeaponId);
  const geoStatus = useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);

  const isPluginLoading = plugin === null;
  const isGeometryStreaming = geoStatus.isBuilding && geoStatus.totalCount > 0;

  if (!isPluginLoading && !isGeometryStreaming) {
    return null;
  }

  const shortLabel = getShortWeaponLabel(activeWeaponId);
  const total =
    geoStatus.totalCount ||
    getWeaponManifest(activeWeaponId).catalog.partsCount;
  const ready = isPluginLoading ? 0 : geoStatus.readyCount;

  return (
    <div className="geo-build-banner" role="status" aria-live="polite">
      <Cpu size={13} className="geo-build-icon" />
      <span>
        正在异步构建 {shortLabel} CSG 机械内构 · {ready} / {total}
      </span>
    </div>
  );
};

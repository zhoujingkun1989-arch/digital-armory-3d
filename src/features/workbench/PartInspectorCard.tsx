import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Focus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useActiveFiringPhase } from '../../engine/clock/playbackClock';
import {
  getCachedPartGeometry,
  subscribeGeometryStatus,
} from '../../engine/geometry/geometryService';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import type { FiringPhaseInfo, MaterialKind } from '../../weapons/types';

const EMPTY_FIRING_PHASES: readonly FiringPhaseInfo[] = [];

const MATERIAL_NAMES_ZH: Record<MaterialKind, string> = {
  nitride_steel: '碳氮共渗/磷化烤漆合金钢',
  barrel_steel: '冷锻精密枪管钢 (镀硬铬/氮化)',
  stainless: '精密冲压/锻造不锈钢与镀铬活塞钢',
  polymer_frame: '高强度玻纤增强尼龙/聚酰胺聚合物',
  spring_steel: '高疲劳强度多股琴钢丝弹簧',
  follower_orange: '高辨识度防卡滞工程聚合物',
  copper_accent: '黄铜合金示意表面',
};

export const PartInspectorCard: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const isolateSelected = useAppStore((s) => s.isolateSelected);
  const selectPart = useAppStore((s) => s.selectPart);
  const toggleIsolateSelected = useAppStore((s) => s.toggleIsolateSelected);
  const activateCutawayFocus = useAppStore((s) => s.activateCutawayFocus);

  const [, setGeoTick] = useState(0);
  useEffect(() => {
    return subscribeGeometryStatus((changedWeaponId) => {
      if (changedWeaponId === activeWeaponId) {
        setGeoTick((n) => n + 1);
      }
    });
  }, [activeWeaponId]);

  const manifest = getWeaponManifest(activeWeaponId);
  const meta = manifest.workbenchMeta;
  const plugin = useWeaponPlugin(activeWeaponId);
  const weaponParts = plugin?.parts ?? [];
  const partGroups = plugin?.partGroups ?? [];
  const activePhase = useActiveFiringPhase(
    plugin?.firingPhases ?? EMPTY_FIRING_PHASES
  );

  // When no part is selected:
  // - In Explode mode: keep the 3D viewport 100% open & unobstructed for hairline callouts,
  //   offering just a compact top-right Cutaway pill.
  // - In Firing mode: show a compact real-time step narration card (re-renders only on phase transitions).
  if (!selectedPartId) {
    if (mode === 'firing') {
      if (!activePhase) return null;
      return (
        <div className="inspector-card firing-compact-card">
          <div className="guide-badge firing-badge">
            发射循环实时解析 · {activePhase.stepNum} / 07
          </div>
          <h3 className="guide-title">{activePhase.title}</h3>
          <p className="guide-desc">{activePhase.description}</p>
        </div>
      );
    }

    return (
      <button
        className="floating-cutaway-pill"
        onClick={activateCutawayFocus}
        title={meta.cutawayTitle}
      >
        <ShieldCheck size={14} />
        <span>{meta.cutawayLabel}</span>
      </button>
    );
  }

  const currentIdx = weaponParts.findIndex((p) => p.id === selectedPartId);
  const part = weaponParts[currentIdx];
  if (!part) return null;

  const groupMeta = partGroups.find((g) => g.key === part.group);
  const badgeColor = groupMeta?.badgeColor ?? '#0284c7';
  const groupNameZh = groupMeta?.nameZh ?? part.group;

  const cachedGeo = getCachedPartGeometry(activeWeaponId, part.id);
  let cadEnvelopeLabel = '实时 CSG 测绘中...';
  let meshTriLabel = '构建中...';
  if (cachedGeo) {
    if (!cachedGeo.boundingBox) {
      cachedGeo.computeBoundingBox();
    }
    const box = cachedGeo.boundingBox;
    if (box) {
      const dxMm = (box.max.x - box.min.x) * 10;
      const dyMm = (box.max.y - box.min.y) * 10;
      const dzMm = (box.max.z - box.min.z) * 10;
      cadEnvelopeLabel = `${dxMm.toFixed(1)} × ${dyMm.toFixed(1)} × ${dzMm.toFixed(1)} mm`;
    }
    const indexAttr = cachedGeo.getIndex();
    const posAttr = cachedGeo.getAttribute('position');
    const triCount = indexAttr
      ? Math.round(indexAttr.count / 3)
      : posAttr
        ? Math.round(posAttr.count / 3)
        : 0;
    meshTriLabel = `${triCount.toLocaleString('en-US')} Δ 三角面`;
  }

  const goPrev = () => {
    const prevIdx =
      (currentIdx - 1 + weaponParts.length) % weaponParts.length;
    selectPart(weaponParts[prevIdx].id);
  };

  const goNext = () => {
    const nextIdx = (currentIdx + 1) % weaponParts.length;
    selectPart(weaponParts[nextIdx].id);
  };

  return (
    <div className="inspector-card">
      <div className="inspector-top">
        <span
          className="part-group-badge"
          style={{
            borderColor: badgeColor,
            color: badgeColor,
          }}
        >
          {part.bomCode} · {groupNameZh}
        </span>
        <button
          className="close-btn"
          onClick={() => selectPart(null)}
          title="关闭详情 (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      <h2 className="part-title-zh">{part.nameZh}</h2>
      <div className="part-title-en">{part.nameEn}</div>

      <div className="meta-grid">
        <div className="meta-row">
          <span className="meta-label">机械定位</span>
          <span className="meta-value highlight">{part.roleTag}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">典型材质</span>
          <span className="meta-value">{MATERIAL_NAMES_ZH[part.material]}</span>
        </div>
        <div
          className="meta-row"
          title="局部 CAD 轴向包络尺寸：轴长 X × 高度 Y × 宽度 Z (1 场景单位 = 10 mm)"
        >
          <span className="meta-label">CAD 包络尺寸</span>
          <span className="meta-value mono">{cadEnvelopeLabel}</span>
        </div>
        <div
          className="meta-row"
          title="实时布尔 CSG / 参数化流形三角网格面数"
        >
          <span className="meta-label">CSG 网格拓扑</span>
          <span className="meta-value mono">{meshTriLabel}</span>
        </div>
      </div>

      <div className="part-description">{part.description}</div>

      <div className="inspector-actions">
        <button
          className={`isolate-btn ${isolateSelected ? 'active' : ''}`}
          onClick={toggleIsolateSelected}
        >
          <Focus size={14} />
          <span>{isolateSelected ? '退出单独隔离' : '单独隔离查看该零件'}</span>
        </button>

        <div className="step-nav">
          <button onClick={goPrev} title="上一个零件">
            <ChevronLeft size={15} />
          </button>
          <span className="step-counter">
            <Crosshair size={12} />
            {currentIdx + 1} / {weaponParts.length}
          </span>
          <button onClick={goNext} title="下一个零件">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

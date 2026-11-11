import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Focus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { MaterialKind } from '../data/g17PartsSpec';
import {
  getWeaponActiveFiringPhase,
  getWeaponPartGroups,
  getWeaponParts,
  getWeaponWorkbenchMeta,
} from '../data/weaponRegistry';
import { useExplodeStore } from '../store/useExplodeStore';

const MATERIAL_NAMES_ZH: Record<MaterialKind, string> = {
  nitride_steel: '碳氮共渗/磷化烤漆合金钢',
  barrel_steel: '冷锻精密枪管钢 (镀硬铬/氮化)',
  stainless: '精密冲压/锻造不锈钢与镀铬活塞钢',
  polymer_frame: '高强度玻纤增强尼龙/聚酰胺聚合物',
  spring_steel: '高疲劳强度多股琴钢丝弹簧',
  follower_orange: '高辨识度防卡滞工程聚合物',
  copper_accent: '黄铜合金示意表面',
};

export const PartDetailCard: React.FC = () => {
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const mode = useExplodeStore((s) => s.mode);
  const selectedPartId = useExplodeStore((s) => s.selectedPartId);
  const isolateSelected = useExplodeStore((s) => s.isolateSelected);
  const fireProgress = useExplodeStore((s) => s.fireProgress);
  const selectPart = useExplodeStore((s) => s.selectPart);
  const toggleIsolateSelected = useExplodeStore((s) => s.toggleIsolateSelected);
  const activateSafeActionCutaway = useExplodeStore(
    (s) => s.activateSafeActionCutaway
  );

  const weaponParts = getWeaponParts(activeWeaponId);
  const partGroups = getWeaponPartGroups(activeWeaponId);
  const meta = getWeaponWorkbenchMeta(activeWeaponId);

  // When no part is selected:
  // - In Explode mode: keep the 3D viewport 100% open & unobstructed for hairline callouts,
  //   offering just a compact top-right Cutaway pill!
  // - In Firing mode: show a compact real-time step narration card.
  if (!selectedPartId) {
    if (mode === 'firing') {
      const phase = getWeaponActiveFiringPhase(activeWeaponId, fireProgress);
      return (
        <div className="inspector-card firing-compact-card">
          <div className="guide-badge firing-badge">
            发射循环实时解析 · {phase.stepNum} / 07
          </div>
          <h3 className="guide-title">{phase.title}</h3>
          <p className="guide-desc">{phase.description}</p>
        </div>
      );
    }

    return (
      <button
        className="floating-cutaway-pill"
        onClick={activateSafeActionCutaway}
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

  const groupMeta = partGroups.find((g) => g.key === part.group)!;

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
            borderColor: groupMeta.badgeColor,
            color: groupMeta.badgeColor,
          }}
        >
          {part.bomCode} · {groupMeta.nameZh}
        </span>
        <button
          className="close-btn"
          onClick={() => selectPart(null)}
          title="关闭详情"
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

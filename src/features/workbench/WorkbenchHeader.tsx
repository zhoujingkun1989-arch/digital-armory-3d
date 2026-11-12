import React from 'react';
import {
  ArrowLeft,
  Box,
  Camera,
  Eye,
  Flame,
  Image as ImageIcon,
  RotateCcw,
  Scissors,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { CameraPresetType } from '../../weapons/types';

const VIEW_ANGLES: { key: CameraPresetType; label: string }[] = [
  { key: 'iso', label: '等轴测' },
  { key: 'right', label: '右侧' },
  { key: 'left', label: '左侧' },
  { key: 'top', label: '俯视' },
];

export const WorkbenchHeader: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const showEdges = useAppStore((s) => s.showEdges);
  const showLabels = useAppStore((s) => s.showLabels);
  const cameraPreset = useAppStore((s) => s.cameraCommand.preset);

  const togglePbrTextures = useAppStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const toggleShowEdges = useAppStore((s) => s.toggleShowEdges);
  const toggleShowLabels = useAppStore((s) => s.toggleShowLabels);
  const triggerCameraPreset = useAppStore((s) => s.triggerCameraPreset);
  const resetAll = useAppStore((s) => s.resetAll);

  const manifest = getWeaponManifest(activeWeaponId);
  const meta = manifest.workbenchMeta;
  const partsCount = manifest.catalog.partsCount;

  return (
    <header className="top-bar">
      <div className="brand-block">
        <button
          type="button"
          className="back-armory-btn"
          onClick={returnToArmory}
          title="返回 3D 数字枪库选择其他枪型 (Esc)"
        >
          <ArrowLeft size={14} />
          <span>枪库</span>
        </button>

        <div className="brand-badge">{meta.badge}</div>
        <div>
          <h1 className="brand-title">{meta.title}</h1>
          <p className="brand-sub">{meta.subtitle}</p>
        </div>
      </div>

      <div className="toolbar-cluster">
        <div className="camera-pills">
          <Camera size={13} className="cam-icon" />
          {VIEW_ANGLES.map((v) => (
            <button
              key={v.key}
              className={`cam-btn ${cameraPreset === v.key ? 'active' : ''}`}
              onClick={() => triggerCameraPreset(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <button
          className={`toggle-chip ${mode === 'firing' ? 'active-orange' : ''}`}
          onClick={() => setMode(mode === 'firing' ? 'explode' : 'firing')}
          title="切换子弹动态发射与抛壳复进流程演示"
        >
          <Flame size={14} />
          <span>发射演示</span>
        </button>

        <button
          className={`toggle-chip ${pbrTexturesEnabled ? 'active-cyan' : ''}`}
          onClick={togglePbrTextures}
          title="开启/关闭真实 2K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)"
        >
          <Sparkles size={13} />
          <span>PBR 贴图</span>
        </button>

        <button
          className="toggle-chip"
          onClick={() => setTextureModalOpen(true)}
          title="打开真实 PBR 材质贴图图集检视器"
        >
          <ImageIcon size={13} />
          <span>图集</span>
        </button>

        <button
          className={`toggle-chip ${xrayShells ? 'active-cyan' : ''}`}
          onClick={toggleXrayShells}
          title="将外层机匣/套筒、护木与弹匣壳体切换为半透明透视材质 (X)"
        >
          <Eye size={14} />
          <span>X-Ray 透视</span>
        </button>

        <button
          className={`toggle-chip ${sectionCut ? 'active-teal' : ''}`}
          onClick={toggleSectionCut}
          title="沿纵向中轴切开外层机匣/套筒/弹匣右侧壳体，原色直视内部膛线、闭锁突笋与实弹供弹机构 (C)"
        >
          <Scissors size={14} />
          <span>军械剖视</span>
        </button>

        <button
          className={`toggle-chip ${showEdges ? 'active' : ''}`}
          onClick={toggleShowEdges}
          title="开启/关闭工业 CAD 硬边轮廓线 (E)"
        >
          <Box size={14} />
          <span>CAD 描边</span>
        </button>

        {mode === 'explode' && (
          <button
            className={`toggle-chip ${showLabels ? 'active' : ''}`}
            onClick={toggleShowLabels}
            title={`显示全部 ${partsCount} 个零件的 3D 空间编号引出签 (L)`}
          >
            <Tag size={14} />
            <span>零件标签</span>
          </button>
        )}

        <button
          className="toggle-chip reset-chip"
          onClick={resetAll}
          title="重置回 100% 爆炸视图与默认视角 (R)"
        >
          <RotateCcw size={14} />
          <span>复位</span>
        </button>
      </div>
    </header>
  );
};

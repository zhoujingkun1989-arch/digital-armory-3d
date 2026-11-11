import React from 'react';
import {
  ArrowLeft,
  Box,
  Camera,
  Eye,
  Flame,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Tag,
} from 'lucide-react';
import { G17Scene } from './components/G17Scene';
import { CalloutOverlay } from './components/CalloutOverlay';
import { ArmoryView } from './components/ArmoryView';
import { TextureAtlasModal } from './components/TextureAtlasModal';
import { PartTreeSidebar } from './components/PartTreeSidebar';
import { PartDetailCard } from './components/PartDetailCard';
import { TimelineBar } from './components/TimelineBar';
import {
  getWeaponParts,
  getWeaponWorkbenchMeta,
} from './data/weaponRegistry';
import { CameraPresetType, useExplodeStore } from './store/useExplodeStore';

const VIEW_ANGLES: { key: CameraPresetType; label: string }[] = [
  { key: 'iso', label: '等轴测' },
  { key: 'right', label: '右侧' },
  { key: 'left', label: '左侧' },
  { key: 'top', label: '俯视' },
];

export const App: React.FC = () => {
  const screen = useExplodeStore((s) => s.screen);
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const returnToArmory = useExplodeStore((s) => s.returnToArmory);

  const mode = useExplodeStore((s) => s.mode);
  const setMode = useExplodeStore((s) => s.setMode);
  const pbrTexturesEnabled = useExplodeStore((s) => s.pbrTexturesEnabled);
  const xrayShells = useExplodeStore((s) => s.xrayShells);
  const showEdges = useExplodeStore((s) => s.showEdges);
  const showLabels = useExplodeStore((s) => s.showLabels);
  const cameraPreset = useExplodeStore((s) => s.cameraCommand.preset);

  const togglePbrTextures = useExplodeStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useExplodeStore((s) => s.setTextureModalOpen);
  const toggleXrayShells = useExplodeStore((s) => s.toggleXrayShells);
  const toggleShowEdges = useExplodeStore((s) => s.toggleShowEdges);
  const toggleShowLabels = useExplodeStore((s) => s.toggleShowLabels);
  const triggerCameraPreset = useExplodeStore((s) => s.triggerCameraPreset);
  const resetAll = useExplodeStore((s) => s.resetAll);

  const meta = getWeaponWorkbenchMeta(activeWeaponId);
  const partsCount = getWeaponParts(activeWeaponId).length;

  return (
    <div className="app-shell">
      {/* Persistent Fullscreen Interactive 3D Viewport (seamless Armory <-> Workbench transition) */}
      <div className="canvas-container">
        <G17Scene />
      </div>

      {/* Architectural Hairline Leader Callouts Overlay (active in Workbench) */}
      <CalloutOverlay />

      {screen === 'armory' ? (
        <ArmoryView />
      ) : (
        <>
          {/* Top Engineering Header Bar */}
          <header className="top-bar">
            <div className="brand-block">
              <button
                type="button"
                className="back-armory-btn"
                onClick={returnToArmory}
                title="返回 3D 数字枪库选择其他枪型"
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
                    className={`cam-btn ${
                      cameraPreset === v.key ? 'active' : ''
                    }`}
                    onClick={() => triggerCameraPreset(v.key)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="toolbar-divider" />

              <button
                className={`toggle-chip ${
                  mode === 'firing' ? 'active-orange' : ''
                }`}
                onClick={() =>
                  setMode(mode === 'firing' ? 'explode' : 'firing')
                }
                title="切换子弹动态发射与抛壳复进流程演示"
              >
                <Flame size={14} />
                <span>发射演示</span>
              </button>

              <button
                className={`toggle-chip ${
                  pbrTexturesEnabled ? 'active-cyan' : ''
                }`}
                onClick={togglePbrTextures}
                title="开启/关闭真实 2K PBR 材质贴图 (Albedo + Normal + Roughness)"
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
                title="将外层机匣/套筒、护木与弹匣壳体切换为半透明透视材质"
              >
                <Eye size={14} />
                <span>X-Ray 透视</span>
              </button>

              <button
                className={`toggle-chip ${showEdges ? 'active' : ''}`}
                onClick={toggleShowEdges}
                title="开启/关闭工业 CAD 硬边轮廓线"
              >
                <Box size={14} />
                <span>CAD 描边</span>
              </button>

              {mode === 'explode' && (
                <button
                  className={`toggle-chip ${showLabels ? 'active' : ''}`}
                  onClick={toggleShowLabels}
                  title={`显示全部 ${partsCount} 个零件的 3D 空间编号引出签`}
                >
                  <Tag size={14} />
                  <span>零件标签</span>
                </button>
              )}

              <button
                className="toggle-chip reset-chip"
                onClick={resetAll}
                title="重置回 100% 爆炸视图与默认视角"
              >
                <RotateCcw size={14} />
                <span>复位</span>
              </button>
            </div>
          </header>

          {/* Left BOM Tree */}
          <PartTreeSidebar />

          {/* Right Part Technical Inspector / Stage & Firing Guide */}
          <PartDetailCard />

          {/* Bottom Staged Disassembly / Firing Cycle Dock */}
          <TimelineBar />
        </>
      )}

      {/* PBR Texture Atlas Inspector Modal */}
      <TextureAtlasModal />

      {/* Subtle Schematic Notice Footer */}
      <div className="schematic-watermark">
        <Sparkles size={11} />
        <span>原理示意级可视化模型 · 仅用于机械结构科普与交互演示</span>
      </div>
    </div>
  );
};

export default App;

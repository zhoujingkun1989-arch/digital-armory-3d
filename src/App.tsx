import React, { Suspense, lazy } from 'react';
import { Sparkles } from 'lucide-react';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useUrlStateSync } from './app/useUrlStateSync';
import { ViewportErrorBoundary } from './app/ViewportErrorBoundary';
import { CalloutOverlay } from './engine/callout/CalloutOverlay';
import { ArmoryViewport } from './engine/canvas/ArmoryViewport';
import { ArmoryView } from './features/armory/ArmoryView';
import { BomTreeSidebar } from './features/workbench/BomTreeSidebar';
import { GeometryBuildBanner } from './features/workbench/GeometryBuildBanner';
import { PartInspectorCard } from './features/workbench/PartInspectorCard';
import { TimelineDock } from './features/workbench/TimelineDock';
import { WorkbenchHeader } from './features/workbench/WorkbenchHeader';
import { useAppStore } from './store/useAppStore';

const LazyShowcaseView = lazy(
  () => import('./features/showcase/ShowcaseView')
);
const LazyTextureAtlasModal = lazy(
  () => import('./features/atlas/TextureAtlasModal')
);

export const App: React.FC = () => {
  useUrlStateSync();
  useKeyboardShortcuts();

  const screen = useAppStore((s) => s.screen);
  const textureModalOpen = useAppStore((s) => s.textureModalOpen);

  return (
    <div className="app-shell">
      {/* Persistent Fullscreen Interactive 3D Viewport (seamless Showcase <-> Armory <-> Workbench transition) */}
      <div className="canvas-container">
        <ViewportErrorBoundary>
          <ArmoryViewport />
        </ViewportErrorBoundary>
      </div>

      {/* Architectural Hairline Leader Callouts Overlay (active in Workbench) */}
      <CalloutOverlay />

      {/* Background Web Worker CSG Streaming Progress Pill */}
      <GeometryBuildBanner />

      {screen === 'showcase' ? (
        <Suspense fallback={null}>
          <LazyShowcaseView />
        </Suspense>
      ) : screen === 'armory' ? (
        <ArmoryView />
      ) : (
        <>
          <WorkbenchHeader />
          <BomTreeSidebar />
          <PartInspectorCard />
          <TimelineDock />
        </>
      )}

      {/* Lazy-loaded PBR Texture Atlas Inspector Modal */}
      {textureModalOpen && (
        <Suspense fallback={null}>
          <LazyTextureAtlasModal />
        </Suspense>
      )}

      {/* 1:1 CAD & 5-Channel ORM Telemetry Watermark Footer */}
      {screen !== 'showcase' && (
        <div className="schematic-watermark">
          <Sparkles size={11} />
          <span>
            1:1 精密机械结构与 5 通道 ORM 物理材质还原 · 253 核心零件实时 CSG 测绘
          </span>
        </div>
      )}
    </div>
  );
};

export default App;

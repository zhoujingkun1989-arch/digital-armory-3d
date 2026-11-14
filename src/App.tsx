import React, { Suspense, lazy, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useUrlStateSync } from './app/useUrlStateSync';
import { ViewportErrorBoundary } from './app/ViewportErrorBoundary';
import { useMechanicalSoundEngine } from './engine/audio/mechanicalSoundEngine';
import { CalloutOverlay } from './engine/callout/CalloutOverlay';
import { ArmoryViewport } from './engine/canvas/ArmoryViewport';
import { ArmoryView } from './features/armory/ArmoryView';
import { WeaponStoryDrawer } from './features/story/WeaponStoryDrawer';
import { BallisticsTelemetryHud } from './features/workbench/BallisticsTelemetryHud';
import { BomTreeSidebar } from './features/workbench/BomTreeSidebar';
import { GeometryBuildBanner } from './features/workbench/GeometryBuildBanner';
import { PartInspectorCard } from './features/workbench/PartInspectorCard';
import { TimelineDock } from './features/workbench/TimelineDock';
import { WorkbenchHeader } from './features/workbench/WorkbenchHeader';
import { UI_STRINGS } from './i18n/uiStrings';
import { useStoryDirectorController } from './narration/storyDirector';
import { useAppStore } from './store/useAppStore';

const LazyShowcaseView = lazy(() => import('./features/showcase/ShowcaseView'));
const LazyTextureAtlasModal = lazy(
  () => import('./features/atlas/TextureAtlasModal')
);

export const App: React.FC = () => {
  useUrlStateSync();
  useKeyboardShortcuts();
  useMechanicalSoundEngine();
  useStoryDirectorController();

  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const lang = useAppStore((s) => s.lang);
  const textureModalOpen = useAppStore((s) => s.textureModalOpen);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const telemetryHudOpen = useAppStore((s) => s.telemetryHudOpen);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);

  const uiTheme =
    environmentPreset === 'blueprint_daylight' ? 'light' : 'dark';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = uiTheme;
      document.documentElement.dataset.env = environmentPreset;
    }
  }, [uiTheme, environmentPreset]);

  return (
    <div
      className="app-shell"
      data-theme={uiTheme}
      data-env={environmentPreset}
    >
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
          {mode === 'firing' && telemetryHudOpen && (
            <div
              className={`ballistics-telemetry-slot ${
                sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'
              }`}
            >
              <BallisticsTelemetryHud />
            </div>
          )}
          <PartInspectorCard />
          <TimelineDock />
        </>
      )}

      {/* Bilingual Firearm R&D History Documentary Drawer (available in Armory & Workbench) */}
      <WeaponStoryDrawer />

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
          <span>{UI_STRINGS[lang].watermark}</span>
        </div>
      )}
    </div>
  );
};

export default App;

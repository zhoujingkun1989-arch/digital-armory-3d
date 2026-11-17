import React, { Suspense, lazy, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useUrlStateSync } from './app/useUrlStateSync';
import { ViewportErrorBoundary } from './app/ViewportErrorBoundary';
import { useMechanicalSoundEngine } from './engine/audio/mechanicalSoundEngine';
import { CalloutOverlay } from './engine/callout/CalloutOverlay';
import { scheduleHudBoundsRefresh } from './engine/callout/hudBoundsCache';
import { ArmoryViewport } from './engine/canvas/ArmoryViewport';
import { ArmoryView } from './features/armory/ArmoryView';
import { WeaponStoryDrawer } from './features/story/WeaponStoryDrawer';
import { BallisticsTelemetryHud } from './features/workbench/BallisticsTelemetryHud';
import { BomTreeSidebar } from './features/workbench/BomTreeSidebar';
import { CaliperHud } from './features/workbench/CaliperHud';
import { EngineeringTintLegend } from './features/workbench/EngineeringTintLegend';
import { GeometryBuildBanner } from './features/workbench/GeometryBuildBanner';
import { ImmersiveFloatingBar } from './features/workbench/ImmersiveFloatingBar';
import { PartInspectorCard } from './features/workbench/PartInspectorCard';
import { TimelineDock } from './features/workbench/TimelineDock';
import { WorkbenchHeader } from './features/workbench/WorkbenchHeader';
import { UI_STRINGS } from './i18n/uiStrings';
import { useStoryDirectorController } from './narration/storyDirector';
import { useAppStore } from './store/useAppStore';

const LazyShowcaseView = lazy(() => import('./features/showcase/ShowcaseView'));
const LazyCartridgeLabView = lazy(
  () => import('./features/cartridges/CartridgeLabView')
);
const LazyTextureAtlasModal = lazy(
  () => import('./features/atlas/TextureAtlasModal')
);
const LazyMonographPrintModal = lazy(
  () => import('./features/monograph/MonographPrintModal')
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
  const monographModalOpen = useAppStore((s) => s.monographModalOpen);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const telemetryHudOpen = useAppStore((s) => s.telemetryHudOpen);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const hudHidden = useAppStore((s) => s.hudHidden);

  const uiTheme =
    environmentPreset === 'blueprint_daylight' ? 'light' : 'dark';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = uiTheme;
      document.documentElement.dataset.env = environmentPreset;
    }
  }, [uiTheme, environmentPreset]);

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [
    screen,
    mode,
    lang,
    engineeringTint,
    fieldStripActive,
    malfunctionActive,
    caliperActive,
    hudHidden,
  ]);

  const showLiveTelemetry =
    mode === 'firing' && !malfunctionActive && telemetryHudOpen;

  return (
    <div
      className={`app-shell ${hudHidden ? 'is-hud-hidden' : ''}`}
      data-theme={uiTheme}
      data-env={environmentPreset}
    >
      {/* Persistent Fullscreen Interactive 3D Viewport (seamless Showcase <-> Armory <-> Workbench <-> Cartridge Lab transition) */}
      <div className="canvas-container">
        <ViewportErrorBoundary>
          <ArmoryViewport />
        </ViewportErrorBoundary>
      </div>

      {/* Architectural Hairline Leader Callouts Overlay (active in Workbench) */}
      <CalloutOverlay />

      {/* Minimal Floating Restore & Fullscreen Pill when UI buttons are hidden */}
      <ImmersiveFloatingBar />

      <div
        className="hud-chrome-layer"
        {...(hudHidden ? ({ inert: '' } as Record<string, string>) : {})}
      >
        {/* Background Web Worker CSG Streaming Progress Pill */}
        <GeometryBuildBanner />

        {screen === 'showcase' ? (
          <Suspense fallback={null}>
            <LazyShowcaseView />
          </Suspense>
        ) : screen === 'cartridges' ? (
          <Suspense fallback={null}>
            <LazyCartridgeLabView />
          </Suspense>
        ) : screen === 'armory' ? (
          <ArmoryView />
        ) : (
          <>
            <WorkbenchHeader />
            <BomTreeSidebar />
            {(showLiveTelemetry || engineeringTint || caliperActive) && (
              <div
                className={`ballistics-telemetry-slot ${
                  sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'
                }`}
              >
                {caliperActive && <CaliperHud />}
                {showLiveTelemetry && <BallisticsTelemetryHud />}
                {engineeringTint && <EngineeringTintLegend />}
              </div>
            )}
            <PartInspectorCard />
            <TimelineDock />
          </>
        )}

        {/* Bilingual Firearm R&D History Documentary Drawer (available in Armory & Workbench) */}
        <WeaponStoryDrawer />

        {/* 1:1 CAD & 5-Channel ORM Telemetry Watermark Footer */}
        {screen !== 'showcase' && (
          <div className="schematic-watermark">
            <Sparkles size={11} />
            <span>{UI_STRINGS[lang].watermark}</span>
          </div>
        )}
      </div>

      {/* Lazy-loaded PBR Texture Atlas Inspector Modal */}
      {textureModalOpen && (
        <Suspense fallback={null}>
          <LazyTextureAtlasModal />
        </Suspense>
      )}

      {/* Lazy-loaded Collector Military Monograph Print Studio */}
      {monographModalOpen && (
        <Suspense fallback={null}>
          <LazyMonographPrintModal />
        </Suspense>
      )}
    </div>
  );
};

export default App;

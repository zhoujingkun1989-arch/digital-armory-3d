import React, { Suspense, lazy, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useUrlStateSync } from './app/useUrlStateSync';
import { ViewportErrorBoundary } from './app/ViewportErrorBoundary';
import { useMechanicalSoundEngine } from './engine/audio/mechanicalSoundEngine';
import { CalloutOverlay } from './engine/callout/CalloutOverlay';
import { scheduleHudBoundsRefresh } from './engine/callout/hudBoundsCache';
import { ArmoryViewport } from './engine/canvas/ArmoryViewport';
import { useAttachmentStore } from './engine/attachments/attachmentStore';
import { isTankWeapon } from './engine/physics/armoryPhysics';
import { useTankCrewStore } from './engine/tank/tankCrewStore';
import { ArmoryView } from './features/armory/ArmoryView';
import { WeaponStoryDrawer } from './features/story/WeaponStoryDrawer';
import { BallisticsTelemetryHud } from './features/workbench/BallisticsTelemetryHud';
import { BomTreeSidebar } from './features/workbench/BomTreeSidebar';
import { CaliperHud } from './features/workbench/CaliperHud';
import { CommandPaletteModal } from './features/workbench/CommandPaletteModal';
import { EngineeringTintLegend } from './features/workbench/EngineeringTintLegend';
import { GeometryBuildBanner } from './features/workbench/GeometryBuildBanner';
import { ImmersiveFloatingBar } from './features/workbench/ImmersiveFloatingBar';
import { LiveSectionPlaneBar } from './features/workbench/LiveSectionPlaneBar';
import { PartInspectorCard } from './features/workbench/PartInspectorCard';
import { TankCrewHud } from './features/workbench/TankCrewHud';
import { TimelineDock } from './features/workbench/TimelineDock';
import { WorkbenchHeader } from './features/workbench/WorkbenchHeader';
import { UI_STRINGS } from './i18n/uiStrings';
import { useStoryDirectorController } from './narration/storyDirector';
import { useAppStore } from './store/useAppStore';

const LazyShowcaseView = lazy(() => import('./features/showcase/ShowcaseView'));
const LazyCartridgeLabView = lazy(
  () => import('./features/cartridges/CartridgeLabView')
);
const LazyExternalBallisticsView = lazy(
  () => import('./features/ballistics/ExternalBallisticsView')
);
const LazyTextureAtlasModal = lazy(
  () => import('./features/atlas/TextureAtlasModal')
);
const LazyMonographPrintModal = lazy(
  () => import('./features/monograph/MonographPrintModal')
);
const LazyPosterShareModal = lazy(
  () => import('./features/share/PosterShareModal')
);
const LazySplitShowdownOverlay = lazy(
  () => import('./features/showdown3d/SplitShowdownOverlay')
);
const LazyCausalitySandboxModal = lazy(
  () => import('./features/sandbox/CausalitySandboxModal')
);
const LazyAttachmentBenchPanel = lazy(
  () => import('./features/workbench/AttachmentBenchPanel')
);
const LazyArmorPenetrationModal = lazy(
  () => import('./features/armorlab/ArmorPenetrationModal')
);
const LazyDirectorReelModal = lazy(
  () => import('./features/video/DirectorReelModal')
);
const LazyArmorerPassportModal = lazy(
  () => import('./features/passport/ArmorerPassportModal')
);
const LazyHistoryTimelineModal = lazy(
  () => import('./features/timeline/HistoryTimelineModal')
);
const LazyOfflineMuseumModal = lazy(
  () => import('./features/offline/OfflineMuseumModal')
);

export const App: React.FC = () => {
  useUrlStateSync();
  useKeyboardShortcuts();
  useMechanicalSoundEngine();
  useStoryDirectorController();

  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const lang = useAppStore((s) => s.lang);
  const activeBallisticsCaliber = useAppStore((s) => s.activeBallisticsCaliber);
  const textureModalOpen = useAppStore((s) => s.textureModalOpen);
  const monographModalOpen = useAppStore((s) => s.monographModalOpen);
  const posterShareModalOpen = useAppStore((s) => s.posterShareModalOpen);
  const posterShareOptions = useAppStore((s) => s.posterShareOptions);
  const closePosterModal = useAppStore((s) => s.closePosterModal);
  const causalitySandboxOpen = useAppStore((s) => s.causalitySandboxOpen);
  const armorPenetrationModalOpen = useAppStore(
    (s) => s.armorPenetrationModalOpen
  );
  const closeArmorPenetrationModal = useAppStore(
    (s) => s.closeArmorPenetrationModal
  );
  const directorReelModalOpen = useAppStore((s) => s.directorReelModalOpen);
  const closeDirectorReelModal = useAppStore(
    (s) => s.closeDirectorReelModal
  );
  const passportModalOpen = useAppStore((s) => s.passportModalOpen);
  const closePassportModal = useAppStore((s) => s.closePassportModal);
  const timelineModalOpen = useAppStore((s) => s.timelineModalOpen);
  const closeTimelineModal = useAppStore((s) => s.closeTimelineModal);
  const offlineModalOpen = useAppStore((s) => s.offlineModalOpen);
  const closeOfflineModal = useAppStore((s) => s.closeOfflineModal);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const tankCrewActive = useTankCrewStore((s) => s.active);
  const attachmentBenchOpen = useAttachmentStore((s) => s.benchOpen);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const telemetryHudOpen = useAppStore((s) => s.telemetryHudOpen);
  const sectionCut = useAppStore((s) => s.sectionCut);
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
    sectionCut,
    engineeringTint,
    fieldStripActive,
    malfunctionActive,
    caliperActive,
    attachmentBenchOpen,
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
        ) : screen === 'ballistics' ? (
          <Suspense fallback={null}>
            <LazyExternalBallisticsView
              initialCaliber={activeBallisticsCaliber}
            />
          </Suspense>
        ) : screen === 'split_showdown' ? (
          <Suspense fallback={null}>
            <LazySplitShowdownOverlay />
          </Suspense>
        ) : screen === 'armory' ? (
          <ArmoryView />
        ) : (
          <>
            <WorkbenchHeader />
            <BomTreeSidebar />
            {(showLiveTelemetry ||
              engineeringTint ||
              caliperActive ||
              causalitySandboxOpen ||
              attachmentBenchOpen ||
              (tankCrewActive && isTankWeapon(activeWeaponId))) && (
              <div
                className={`ballistics-telemetry-slot ${
                  sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-open'
                }`}
              >
                {tankCrewActive && isTankWeapon(activeWeaponId) && <TankCrewHud />}
                {attachmentBenchOpen && (
                  <Suspense fallback={null}>
                    <LazyAttachmentBenchPanel />
                  </Suspense>
                )}
                {causalitySandboxOpen && (
                  <Suspense fallback={null}>
                    <LazyCausalitySandboxModal />
                  </Suspense>
                )}
                {caliperActive && <CaliperHud />}
                {showLiveTelemetry && <BallisticsTelemetryHud />}
                {engineeringTint && <EngineeringTintLegend />}
              </div>
            )}
            <PartInspectorCard />
            {sectionCut && <LiveSectionPlaneBar />}
            <TimelineDock />
          </>
        )}

        {/* Bilingual Firearm R&D History Documentary Drawer (available in Armory & Workbench) */}
        <WeaponStoryDrawer />

        {/* 1:1 CAD & 5-Channel ORM Telemetry Watermark Footer */}
        {screen !== 'showcase' &&
          screen !== 'ballistics' &&
          screen !== 'split_showdown' && (
          <div className="schematic-watermark">
            <Sparkles size={11} />
            <span>{UI_STRINGS[lang].watermark}</span>
          </div>
        )}
      </div>

      {/* Global Cmd+K / Ctrl+K Instant Command Palette (accessible from every screen) */}
      <CommandPaletteModal />

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

      {/* Lazy-loaded Instant HD 3D Cutaway Social Poster Studio (`[U]`) */}
      {posterShareModalOpen && (
        <Suspense fallback={null}>
          <LazyPosterShareModal
            open={posterShareModalOpen}
            weaponId={posterShareOptions?.weaponId}
            armorerRank={posterShareOptions?.armorerRank}
            onClose={closePosterModal}
          />
        </Suspense>
      )}

      {/* Lazy-loaded 1:1 Composite Armor Penetration Lab (`WP-20b`) */}
      {armorPenetrationModalOpen && (
        <Suspense fallback={null}>
          <LazyArmorPenetrationModal onClose={closeArmorPenetrationModal} />
        </Suspense>
      )}

      {/* Lazy-loaded 60fps WebGL Director Reel Video Exporter (`WP-22`) */}
      {directorReelModalOpen && (
        <Suspense fallback={null}>
          <LazyDirectorReelModal onClose={closeDirectorReelModal} />
        </Suspense>
      )}

      {/* Lazy-loaded 27-Exhibit Armorer Certification Passport (`WP-23a`) */}
      {passportModalOpen && (
        <Suspense fallback={null}>
          <LazyArmorerPassportModal onClose={closePassportModal} />
        </Suspense>
      )}

      {/* Lazy-loaded 1898-2026 Interactive History Timeline (`WP-24`) */}
      {timelineModalOpen && (
        <Suspense fallback={null}>
          <LazyHistoryTimelineModal onClose={closeTimelineModal} />
        </Suspense>
      )}

      {/* Lazy-loaded PWA Offline Museum & KTX2 Pipeline Center (`WP-25a`) */}
      {offlineModalOpen && (
        <Suspense fallback={null}>
          <LazyOfflineMuseumModal onClose={closeOfflineModal} />
        </Suspense>
      )}
    </div>
  );
};

export default App;

import { useEffect } from 'react';
import { useAttachmentStore } from '../engine/attachments/attachmentStore';
import {
  getNarrationAudioSnapshot,
  stopNarrationAudio,
} from '../narration/audioPlayer';
import { useAppStore } from '../store/useAppStore';

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Global engineering keyboard shortcuts:
 * - `Esc`: Close Texture Atlas -> Clear selected part / active diagnostic tool -> Return to Armory
 * - `Space` (Workbench): Play / Pause disassembly or firing animation
 * - `C` (Armory / Workbench / Cartridge Lab): Toggle 1:1 longitudinal armorer section-cut (`军械剖视`)
 * - `X` (Armory / Workbench): Toggle X-Ray shell transparency
 * - `T` (Armory / Workbench): Toggle functional engineering role color tint (`原理分色`)
 * - `B` (Armory / Workbench / Cartridge Lab): Open / Return from 1:1 SAAMI Cartridge Cutaway Lab (`弹药剖视馆`)
 * - `R` (Global): Open / Return from 1,000m RK4 External Ballistics Range Lab (`外弹道靶场`); `Shift+R` resets Workbench
 * - `U` (Global): Open / Close Instant HD 3D Cutaway Social Poster Studio (`海报分享`)
 * - `G` (Workbench): Toggle hands-on guided military field-strip mode (`亲手快拆`)
 * - `J` (Workbench): Toggle classic firearm malfunction cutaway & clearing diagnostics (`故障排障`)
 * - `K` (Workbench): Toggle 1:1 3D armorer vernier caliper & envelope ruler (`游标卡尺`)
 * - `O` (Workbench): Toggle Modular Optics & Muzzle Attachment Bench (`光学/枪口改装台`) — note `M` remains bound to SFX Mute
 * - `E` (Workbench): Toggle CAD hard-edge wireframe
 * - `L` (Workbench, Explode mode): Toggle 3D part leader labels
 * - `H` (All screens): Hide / Show all UI buttons & HUD panels for clean 3D showcase (`隐藏按钮`)
 * - `Ctrl/Cmd+P` (Global): Open Monograph Print Studio, or trigger formatted monograph print when open
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useAppStore.getState();

      // Intercept Ctrl+P / Cmd+P so Print Studio opens or dispatches formatted monograph printing
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'p'
      ) {
        e.preventDefault();
        if (!state.monographModalOpen) {
          state.openMonographModal(state.activeWeaponId);
        } else {
          window.dispatchEvent(new CustomEvent('armory:monograph-print'));
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (state.monographModalOpen) return;

      if (e.key === 'Escape') {
        const audioSnap = getNarrationAudioSnapshot();
        if (state.posterShareModalOpen) {
          e.preventDefault();
          state.closePosterModal();
          return;
        }
        if (state.textureModalOpen) {
          e.preventDefault();
          state.setTextureModalOpen(false);
          return;
        }
        if (state.hudHidden) {
          e.preventDefault();
          state.setHudHidden(false);
          return;
        }
        if (state.storyOpen && !state.storyMinimized) {
          e.preventDefault();
          if (audioSnap.activeKind === 'story' && audioSnap.isPlaying) {
            state.setStoryMinimized(true);
          } else {
            if (audioSnap.activeKind === 'story') {
              stopNarrationAudio();
            }
            state.setStoryOpen(false);
          }
          return;
        }
        if (isEditableElement(e.target)) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (state.selectedPartId !== null) {
          e.preventDefault();
          if (
            !state.inspectorMinimized &&
            audioSnap.activeKind === 'part' &&
            audioSnap.isPlaying
          ) {
            state.setInspectorMinimized(true);
          } else {
            if (audioSnap.activeKind === 'part') {
              stopNarrationAudio();
            }
            state.selectPart(null);
          }
          return;
        }
        if (state.screen === 'workbench' && useAttachmentStore.getState().benchOpen) {
          e.preventDefault();
          useAttachmentStore.getState().setBenchOpen(false);
          return;
        }
        if (state.screen === 'workbench' && state.caliperActive) {
          e.preventDefault();
          state.setCaliperActive(false);
          return;
        }
        if (state.screen === 'workbench' && state.malfunctionActive) {
          e.preventDefault();
          state.setMalfunctionActive(false);
          return;
        }
        if (state.screen === 'workbench' && state.fieldStripActive) {
          e.preventDefault();
          state.setFieldStripActive(false);
          return;
        }
        if (state.storyOpen && state.storyMinimized) {
          e.preventDefault();
          if (audioSnap.activeKind === 'story') {
            stopNarrationAudio();
          }
          state.setStoryOpen(false);
          return;
        }
        if (
          state.screen === 'workbench' ||
          state.screen === 'showcase' ||
          state.screen === 'cartridges' ||
          state.screen === 'ballistics'
        ) {
          e.preventDefault();
          state.returnToArmory();
        }
        return;
      }

      if (isEditableElement(e.target) || state.textureModalOpen) return;

      const lowerKey = e.key.toLowerCase();

      if (state.posterShareModalOpen) {
        if (!e.shiftKey && lowerKey === 'u') {
          e.preventDefault();
          state.closePosterModal();
        }
        return;
      }

      if (!e.shiftKey && lowerKey === 'u') {
        e.preventDefault();
        state.togglePosterModal({ weaponId: state.activeWeaponId });
        return;
      }

      if (!e.shiftKey && lowerKey === 'r') {
        e.preventDefault();
        if (state.screen === 'ballistics') {
          state.returnToArmory();
        } else if (state.screen === 'cartridges') {
          state.openExternalBallistics(state.activeCartridgeCaliber);
        } else {
          state.openExternalBallistics();
        }
        return;
      }

      if (lowerKey === 'h') {
        e.preventDefault();
        state.toggleHudHidden();
        return;
      }
      if (lowerKey === 'b' && state.screen !== 'showcase') {
        if (state.screen === 'cartridges') {
          state.returnToArmory();
        } else {
          state.openCartridgeLab();
        }
        return;
      }
      if (lowerKey === 'c' && state.screen !== 'ballistics') {
        if (state.screen === 'cartridges') {
          state.toggleCartridgeSectionCut();
        } else {
          state.toggleSectionCut();
        }
        return;
      }
      if (
        lowerKey === 'x' &&
        state.screen !== 'cartridges' &&
        state.screen !== 'ballistics'
      ) {
        state.toggleXrayShells();
        return;
      }
      if (
        lowerKey === 't' &&
        state.screen !== 'showcase' &&
        state.screen !== 'cartridges' &&
        state.screen !== 'ballistics'
      ) {
        state.toggleEngineeringTint();
        return;
      }
      if (lowerKey === 'm') {
        state.toggleSfxMuted();
        return;
      }

      if (state.screen !== 'workbench') return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (state.mode === 'firing') {
          state.toggleFiringPlay();
        } else {
          state.togglePlay();
        }
        return;
      }

      switch (lowerKey) {
        case 'g':
          state.toggleFieldStripMode();
          break;
        case 'j':
          state.toggleMalfunctionMode();
          break;
        case 'k':
          state.toggleCaliperMode();
          break;
        case 'o':
          useAttachmentStore.getState().toggleBenchOpen();
          break;
        case 'e':
          state.toggleShowEdges();
          break;
        case 'l':
          if (state.mode === 'explode') {
            state.toggleShowLabels();
          }
          break;
        case 'r':
          if (e.shiftKey) {
            state.resetAll();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

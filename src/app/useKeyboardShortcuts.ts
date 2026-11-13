import { useEffect } from 'react';
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
 * - `Esc`: Close Texture Atlas -> Clear selected part -> Return to Armory
 * - `Space` (Workbench): Play / Pause disassembly or firing animation
 * - `C` (Armory / Workbench): Toggle 1:1 longitudinal armorer section-cut (`军械剖视`)
 * - `X` (Armory / Workbench): Toggle X-Ray shell transparency
 * - `E` (Workbench): Toggle CAD hard-edge wireframe
 * - `L` (Workbench, Explode mode): Toggle 3D part leader labels
 * - `R` (Workbench): Reset view & assembled (0%) state
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const state = useAppStore.getState();

      if (e.key === 'Escape') {
        const audioSnap = getNarrationAudioSnapshot();
        if (state.textureModalOpen) {
          e.preventDefault();
          state.setTextureModalOpen(false);
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
        if (state.storyOpen && state.storyMinimized) {
          e.preventDefault();
          if (audioSnap.activeKind === 'story') {
            stopNarrationAudio();
          }
          state.setStoryOpen(false);
          return;
        }
        if (state.screen === 'workbench' || state.screen === 'showcase') {
          e.preventDefault();
          state.returnToArmory();
        }
        return;
      }

      if (isEditableElement(e.target) || state.textureModalOpen) return;

      const lowerKey = e.key.toLowerCase();
      if (lowerKey === 'c') {
        state.toggleSectionCut();
        return;
      }
      if (lowerKey === 'x') {
        state.toggleXrayShells();
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
        case 'e':
          state.toggleShowEdges();
          break;
        case 'l':
          if (state.mode === 'explode') {
            state.toggleShowLabels();
          }
          break;
        case 'r':
          state.resetAll();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

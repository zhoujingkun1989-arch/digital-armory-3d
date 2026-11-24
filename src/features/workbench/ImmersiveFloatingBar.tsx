import React, { useEffect, useRef, useState } from 'react';
import { Eye, Keyboard, Maximize2, Minimize2 } from 'lucide-react';
import { useBrowserFullscreen } from '../../app/useFullscreen';
import { openKeyboardShortcutsModal } from '../../app/useKeyboardShortcuts';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

const IDLE_DIM_MS = 2600;

let lastPreImmersiveFocusEl: HTMLElement | null = null;

if (typeof document !== 'undefined') {
  useAppStore.subscribe((state, prevState) => {
    if (state.hudHidden && !prevState.hudHidden) {
      const active = document.activeElement;
      lastPreImmersiveFocusEl =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    } else if (!state.hudHidden && prevState.hudHidden) {
      const toRestore = lastPreImmersiveFocusEl;
      lastPreImmersiveFocusEl = null;
      if (toRestore && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (toRestore.isConnected) {
            toRestore.focus({ preventScroll: true });
          }
        });
      }
    }
  });
}

const ImmersiveFloatingBarBody: React.FC = () => {
  const setHudHidden = useAppStore((s) => s.setHudHidden);
  const lang = useAppStore((s) => s.lang);
  const { isFullscreen, isSupported, toggleFullscreen } =
    useBrowserFullscreen();

  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  const pinnedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const restoreBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    restoreBtnRef.current?.focus({ preventScroll: true });

    const clearIdleTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const armIdleTimer = () => {
      clearIdleTimer();
      if (pinnedRef.current) return;
      timerRef.current = window.setTimeout(() => {
        if (!pinnedRef.current) {
          isIdleRef.current = true;
          setIsIdle(true);
        }
      }, IDLE_DIM_MS);
    };

    const wakeUp = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setIsIdle(false);
      }
      armIdleTimer();
    };

    armIdleTimer();
    window.addEventListener('pointermove', wakeUp, { passive: true });
    window.addEventListener('pointerdown', wakeUp, { passive: true });
    window.addEventListener('keydown', wakeUp, { passive: true });

    return () => {
      clearIdleTimer();
      window.removeEventListener('pointermove', wakeUp);
      window.removeEventListener('pointerdown', wakeUp);
      window.removeEventListener('keydown', wakeUp);
    };
  }, []);

  const studioUi = UI_STRINGS[lang].studio;

  return (
    <div
      ref={barRef}
      role="group"
      aria-label={studioUi.immersiveBarAria}
      className={`immersive-floating-bar ${isIdle ? 'is-idle' : ''}`}
      onPointerEnter={() => {
        pinnedRef.current = true;
        if (isIdleRef.current) {
          isIdleRef.current = false;
          setIsIdle(false);
        }
      }}
      onPointerLeave={() => {
        const hasFocusInside = Boolean(
          barRef.current && barRef.current.contains(document.activeElement)
        );
        pinnedRef.current = hasFocusInside;
        if (!hasFocusInside && typeof window !== 'undefined') {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
          }
          timerRef.current = window.setTimeout(() => {
            if (!pinnedRef.current) {
              isIdleRef.current = true;
              setIsIdle(true);
            }
          }, IDLE_DIM_MS);
        }
      }}
      onFocusCapture={() => {
        pinnedRef.current = true;
        if (isIdleRef.current) {
          isIdleRef.current = false;
          setIsIdle(false);
        }
      }}
      onBlurCapture={(e) => {
        const nextFocused = e.relatedTarget as Node | null;
        if (barRef.current && nextFocused && barRef.current.contains(nextFocused)) {
          return;
        }
        pinnedRef.current = false;
      }}
    >
      {isSupported && (
        <button
          type="button"
          className={`immersive-ctrl-btn ${isFullscreen ? 'is-active' : ''}`}
          title={studioUi.fullscreenTitle(isFullscreen)}
          onClick={() => {
            playWorkbenchFoley('toggle_switch');
            void toggleFullscreen();
          }}
        >
          {isFullscreen ? (
            <Minimize2 size={13} aria-hidden="true" />
          ) : (
            <Maximize2 size={13} aria-hidden="true" />
          )}
          <span>
            {isFullscreen
              ? studioUi.fullscreenExitChip
              : studioUi.fullscreenEnterChip}
          </span>
        </button>
      )}

      <button
        type="button"
        className="immersive-ctrl-btn immersive-shortcuts-btn"
        aria-label={UI_STRINGS[lang].workbench.shortcutsChipTitle}
        title={UI_STRINGS[lang].workbench.shortcutsChipTitle}
        onClick={() => {
          playWorkbenchFoley('toggle_switch');
          openKeyboardShortcutsModal();
        }}
      >
        <Keyboard size={13} aria-hidden="true" />
        <kbd className="immersive-kbd" aria-hidden="true">
          ?
        </kbd>
      </button>

      <button
        ref={restoreBtnRef}
        type="button"
        className="immersive-ctrl-btn immersive-restore-btn"
        title={studioUi.showUiTitle}
        onClick={() => {
          playWorkbenchFoley('toggle_switch');
          setHudHidden(false);
        }}
      >
        <Eye size={13} aria-hidden="true" />
        <span>{studioUi.showUiChip}</span>
        <kbd className="immersive-kbd" aria-hidden="true">
          H
        </kbd>
      </button>
    </div>
  );
};

export const ImmersiveFloatingBar: React.FC = () => {
  const hudHidden = useAppStore((s) => s.hudHidden);
  return hudHidden ? <ImmersiveFloatingBarBody /> : null;
};

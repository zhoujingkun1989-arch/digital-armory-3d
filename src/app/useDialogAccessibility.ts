import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isElementVisibleForFocus(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

/**
 * Returns keyboard-focusable descendants inside `container` in DOM order,
 * excluding disabled, hidden, inert, and `aria-hidden` elements.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const result: HTMLElement[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (el.tabIndex < 0) continue;
    if (!isElementVisibleForFocus(el)) continue;
    result.push(el);
  }
  return result;
}

function isNativeModalDialogOpen(el: HTMLElement): boolean {
  if (
    typeof HTMLDialogElement === 'undefined' ||
    !(el instanceof HTMLDialogElement) ||
    !el.open
  ) {
    return false;
  }
  try {
    return el.matches(':modal');
  } catch {
    return false;
  }
}

export interface UseDialogAccessibilityOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Allow callers to temporarily block Escape dismissal (e.g. while recording). Defaults to `true`. */
  closeOnEscape?: boolean;
  /**
   * Explicitly enable/disable `Tab`/`Shift+Tab` focus trapping.
   * Defaults to trapping inside non-native containers (and `<dialog>` fallback when `:modal` is unavailable),
   * while deferring to browser top-layer containment for active native `<dialog>` modals.
   */
  trapFocus?: boolean;
  /** Move initial focus inside non-native dialog containers when opened. Defaults to `true`. */
  autoFocusContainer?: boolean;
}

/**
 * WCAG 2.1 AA modal & dialog accessibility controller:
 * - Captures `document.activeElement` on open and restores focus on close/unmount
 * - Intercepts `Escape` in capture phase (preventing underlying global shortcut bleed)
 *   and synchronizes native `<dialog>` `cancel` events cleanly
 * - Traps `Tab` / `Shift+Tab` keyboard focus inside non-native dialog containers
 *   while playing cleanly alongside native `<dialog>` top-layer modals
 */
export function useDialogAccessibility({
  isOpen,
  containerRef,
  onClose,
  closeOnEscape = true,
  trapFocus,
  autoFocusContainer = true,
}: UseDialogAccessibilityOptions): void {
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [onClose, closeOnEscape]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;

    const container = containerRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const isNativeDialog =
      typeof HTMLDialogElement !== 'undefined' &&
      container instanceof HTMLDialogElement;

    if (
      container &&
      !isNativeDialog &&
      autoFocusContainer &&
      !container.contains(document.activeElement)
    ) {
      const explicitAutoFocus = container.querySelector<HTMLElement>(
        '[autofocus]:not([disabled])'
      );
      const focusables = getFocusableElements(container);
      const initialTarget =
        (explicitAutoFocus && isElementVisibleForFocus(explicitAutoFocus)
          ? explicitAutoFocus
          : focusables[0]) ?? container;
      if (initialTarget === container && !container.hasAttribute('tabindex')) {
        container.tabIndex = -1;
      }
      try {
        initialTarget.focus({ preventScroll: true });
      } catch {
        // Non-fatal in constrained test environments
      }
    }

    let dismissed = false;
    const requestClose = () => {
      if (dismissed) return;
      dismissed = true;
      onCloseRef.current();
    };

    const onDialogCancel = (e: Event) => {
      e.preventDefault();
      if (closeOnEscapeRef.current) {
        requestClose();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const activeContainer = containerRef.current;
      if (!activeContainer) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (closeOnEscapeRef.current) {
          requestClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const shouldTrap =
          trapFocus !== undefined
            ? trapFocus
            : !isNativeModalDialogOpen(activeContainer);
        if (!shouldTrap) return;

        const focusables = getFocusableElements(activeContainer);
        if (focusables.length === 0) {
          e.preventDefault();
          if (!activeContainer.hasAttribute('tabindex')) {
            activeContainer.tabIndex = -1;
          }
          activeContainer.focus({ preventScroll: true });
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = document.activeElement;

        if (e.shiftKey) {
          if (
            !current ||
            !activeContainer.contains(current) ||
            current === first ||
            current === activeContainer
          ) {
            e.preventDefault();
            last.focus({ preventScroll: true });
          }
        } else if (
          !current ||
          !activeContainer.contains(current) ||
          current === last
        ) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    if (isNativeDialog && container) {
      container.addEventListener('cancel', onDialogCancel);
    }
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      if (isNativeDialog && container) {
        container.removeEventListener('cancel', onDialogCancel);
      }
      window.removeEventListener('keydown', onKeyDown, true);

      if (
        previouslyFocused &&
        previouslyFocused.isConnected &&
        previouslyFocused !== document.body &&
        typeof previouslyFocused.focus === 'function'
      ) {
        const currentActive = document.activeElement;
        const shouldRestore =
          !currentActive ||
          currentActive === document.body ||
          (container !== null && container.contains(currentActive));
        if (shouldRestore) {
          try {
            previouslyFocused.focus({ preventScroll: true });
          } catch {
            // Non-fatal in constrained DOM environments
          }
        }
      }
    };
  }, [isOpen, containerRef, trapFocus, autoFocusContainer]);
}

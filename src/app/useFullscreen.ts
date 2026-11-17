import { useCallback, useEffect, useState } from 'react';

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function isBrowserFullscreenSupported(doc?: Document | null): boolean {
  const d = (
    doc === undefined ? (typeof document !== 'undefined' ? document : null) : doc
  ) as WebkitFullscreenDocument | null;
  if (!d || !d.documentElement) return false;
  const root = d.documentElement as WebkitFullscreenElement;
  if (typeof root.requestFullscreen === 'function') {
    return d.fullscreenEnabled !== false;
  }
  if (typeof root.webkitRequestFullscreen === 'function') {
    return d.webkitFullscreenEnabled !== false;
  }
  return false;
}

export function isBrowserFullscreenActive(doc?: Document | null): boolean {
  const d = (
    doc === undefined ? (typeof document !== 'undefined' ? document : null) : doc
  ) as WebkitFullscreenDocument | null;
  if (!d) return false;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/**
 * Toggles native browser fullscreen on `document.documentElement` (with Safari WebKit fallback).
 * Returns the resulting fullscreen active boolean (`true` if now fullscreen, `false` otherwise).
 */
export async function toggleBrowserFullscreen(
  doc?: Document | null
): Promise<boolean> {
  const d = (
    doc === undefined ? (typeof document !== 'undefined' ? document : null) : doc
  ) as WebkitFullscreenDocument | null;
  if (!d || !d.documentElement) return false;

  try {
    if (isBrowserFullscreenActive(d)) {
      if (typeof d.exitFullscreen === 'function') {
        await d.exitFullscreen();
      } else if (typeof d.webkitExitFullscreen === 'function') {
        await d.webkitExitFullscreen();
      }
      return isBrowserFullscreenActive(d);
    }

    const root = d.documentElement as WebkitFullscreenElement;
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen();
      return isBrowserFullscreenActive(d);
    }
    if (typeof root.webkitRequestFullscreen === 'function') {
      await root.webkitRequestFullscreen();
      return isBrowserFullscreenActive(d);
    }
  } catch {
    // Gracefully handle restricted iframe / gesture rejections
    return isBrowserFullscreenActive(d);
  }

  return isBrowserFullscreenActive(d);
}

export interface BrowserFullscreenControl {
  isFullscreen: boolean;
  isSupported: boolean;
  toggleFullscreen: () => Promise<boolean>;
}

export function useBrowserFullscreen(): BrowserFullscreenControl {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    isBrowserFullscreenActive()
  );
  const [isSupported] = useState<boolean>(() =>
    isBrowserFullscreenSupported()
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      setIsFullscreen(isBrowserFullscreenActive());
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    const next = await toggleBrowserFullscreen();
    setIsFullscreen(isBrowserFullscreenActive());
    return next;
  }, []);

  return { isFullscreen, isSupported, toggleFullscreen };
}

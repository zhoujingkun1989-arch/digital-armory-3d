export interface ScreenRectBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const HUD_OBSTACLE_SELECTOR =
  '.top-bar, .hud-collapsed-btn, .part-sidebar, .ballistics-telemetry-slot, .engineering-tint-legend, .field-strip-hud, .malfunction-hud, .caliper-hud, .floating-cutaway-pill, .inspector-card, .inspector-mini-pill, .timeline-dock, .geo-build-banner, .story-drawer, .story-mini-player';
const HUD_HEADER_SELECTOR = '.armory-header, .top-bar, .cartridge-header';
const HUD_DOCK_SELECTOR = '.armory-rack-dock, .timeline-dock, .cartridge-dock';

let cachedBoxes: ScreenRectBox[] = [];
let initialized = false;
let rafPending = false;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let lastTopOffsetPx = -1;
let lastBottomOffsetPx = -1;

function syncShellClearanceVars(shellEl: HTMLElement): void {
  const shellRect = shellEl.getBoundingClientRect();
  if (shellRect.height <= 0) return;

  const headerEl = shellEl.querySelector<HTMLElement>(HUD_HEADER_SELECTOR);
  if (headerEl) {
    resizeObserver?.observe(headerEl);
    const headerRect = headerEl.getBoundingClientRect();
    if (headerRect.height > 0) {
      const nextTop = Math.max(
        60,
        Math.ceil(headerRect.bottom - shellRect.top + 10)
      );
      if (nextTop !== lastTopOffsetPx) {
        lastTopOffsetPx = nextTop;
        shellEl.style.setProperty('--hud-top-offset', `${nextTop}px`);
      }
    }
  }

  const dockEl = shellEl.querySelector<HTMLElement>(HUD_DOCK_SELECTOR);
  if (dockEl) {
    resizeObserver?.observe(dockEl);
    const dockRect = dockEl.getBoundingClientRect();
    if (dockRect.height > 0) {
      const nextBottom = Math.max(
        24,
        Math.ceil(shellRect.bottom - dockRect.top + 12)
      );
      if (nextBottom !== lastBottomOffsetPx) {
        lastBottomOffsetPx = nextBottom;
        shellEl.style.setProperty('--hud-bottom-offset', `${nextBottom}px`);
      }
    }
  }
}

function measureHudObstaclesNow(): void {
  rafPending = false;
  if (typeof document === 'undefined') return;

  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  const shellEl = document.querySelector<HTMLElement>('.app-shell');
  if (shellEl) {
    resizeObserver?.observe(shellEl);
    syncShellClearanceVars(shellEl);
  }

  const nodes = document.querySelectorAll(HUD_OBSTACLE_SELECTOR);
  const next: ScreenRectBox[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (resizeObserver) {
      resizeObserver.observe(el);
    }
    const rect = el.getBoundingClientRect();
    if (rect.width > 4 && rect.height > 4) {
      next.push({
        xMin: rect.left - 5,
        xMax: rect.right + 5,
        yMin: rect.top - 5,
        yMax: rect.bottom + 5,
      });
    }
  }
  cachedBoxes = next;
}

export function scheduleHudBoundsRefresh(): void {
  if (typeof window === 'undefined' || rafPending) return;
  rafPending = true;
  window.requestAnimationFrame(measureHudObstaclesNow);
}

export function initHudBoundsObserver(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  if (initialized) {
    scheduleHudBoundsRefresh();
    return () => {};
  }
  initialized = true;

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      scheduleHudBoundsRefresh();
    });
  }

  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => {
      scheduleHudBoundsRefresh();
    });
    const root = document.querySelector('.app-shell') ?? document.body;
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  const onWindowResize = () => scheduleHudBoundsRefresh();
  window.addEventListener('resize', onWindowResize, { passive: true });
  measureHudObstaclesNow();

  return () => {
    window.removeEventListener('resize', onWindowResize);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    resizeObserver = null;
    mutationObserver = null;
    lastTopOffsetPx = -1;
    lastBottomOffsetPx = -1;
    initialized = false;
  };
}

/**
 * Returns pre-measured HUD bounding boxes in O(1) without triggering synchronous layout reflow inside `useFrame`.
 */
export function getCachedHudBoxes(): readonly ScreenRectBox[] {
  return cachedBoxes;
}

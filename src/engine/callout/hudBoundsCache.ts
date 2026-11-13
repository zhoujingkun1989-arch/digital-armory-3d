export interface ScreenRectBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const HUD_OBSTACLE_SELECTOR =
  '.top-bar, .hud-collapsed-btn, .part-sidebar, .floating-cutaway-pill, .inspector-card, .inspector-mini-pill, .timeline-dock, .geo-build-banner, .story-drawer, .story-mini-player';

let cachedBoxes: ScreenRectBox[] = [];
let initialized = false;
let rafPending = false;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;

function measureHudObstaclesNow(): void {
  rafPending = false;
  if (typeof document === 'undefined') return;
  const nodes = document.querySelectorAll(HUD_OBSTACLE_SELECTOR);
  const next: ScreenRectBox[] = [];

  if (resizeObserver) {
    resizeObserver.disconnect();
  }

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
    initialized = false;
  };
}

/**
 * Returns pre-measured HUD bounding boxes in O(1) without triggering synchronous layout reflow inside `useFrame`.
 */
export function getCachedHudBoxes(): readonly ScreenRectBox[] {
  return cachedBoxes;
}

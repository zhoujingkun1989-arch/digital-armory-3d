import React from 'react';
import { ChevronLeft, ChevronRight, Compass, X } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { isWeaponId, type WeaponId } from '../../weapons/types';
import {
  HISTORY_TIMELINE_TOURS,
  type HistoryTimelineTourSpec,
} from '../timeline/historyTimelineSpecs';

export function findCuratorTourById(
  tourId: string | null
): HistoryTimelineTourSpec | null {
  if (!tourId) return null;
  return HISTORY_TIMELINE_TOURS.find((t) => t.id === tourId) ?? null;
}

export interface CuratorTrailBarProps {
  /** Optional overrides for deterministic SSR/unit verification */
  tourIdOverride?: string | null;
  weaponIdOverride?: WeaponId;
  langOverride?: LanguageCode;
}

export const CuratorTrailBar: React.FC<CuratorTrailBarProps> = ({
  tourIdOverride,
  weaponIdOverride,
  langOverride,
}) => {
  const storeTourId = useAppStore((s) => s.activeTourId);
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const storeLang = useAppStore((s) => s.lang);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const exitCuratorTour = useAppStore((s) => s.exitCuratorTour);

  const activeTourId =
    tourIdOverride !== undefined ? tourIdOverride : storeTourId;
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const lang = langOverride ?? storeLang;
  const isZh = lang === 'zh';

  const tour = findCuratorTourById(activeTourId);
  if (!tour || tour.weaponIds.length === 0) {
    return null;
  }

  const rawIndex = tour.weaponIds.indexOf(activeWeaponId);
  const currentIdx = rawIndex >= 0 ? rawIndex : 0;
  const totalStops = tour.weaponIds.length;
  const canGoPrev = currentIdx > 0;
  const canGoNext = currentIdx < totalStops - 1;

  const navigateToStop = (weaponIdRaw: string) => {
    if (!isWeaponId(weaponIdRaw)) return;
    playWorkbenchFoley('preset_detent');
    enterWorkbench(weaponIdRaw, 'explode');
  };

  const handlePrev = () => {
    if (!canGoPrev) return;
    navigateToStop(tour.weaponIds[currentIdx - 1]);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    navigateToStop(tour.weaponIds[currentIdx + 1]);
  };

  const handleExit = () => {
    playWorkbenchFoley('toggle_switch');
    exitCuratorTour();
  };

  return (
    <nav
      className="curator-trail-bar"
      data-testid="curator-trail-bar"
      data-tour-id={tour.id}
      aria-label={isZh ? '3D 策展主题导览进度条' : 'Live 3D Curator Tour Navigator'}
    >
      <div className="curator-trail-head">
        <span className="curator-trail-badge">
          <Compass size={12} aria-hidden="true" />
          <span className="curator-trail-title">
            {isZh ? tour.titleZh : tour.titleEn}
          </span>
        </span>
        <span
          className="curator-trail-counter"
          data-testid="curator-trail-counter"
        >
          {currentIdx + 1} / {totalStops}
        </span>
      </div>

      <div
        className="curator-trail-stops"
        role="group"
        aria-label={isZh ? '导览站点快速切换' : 'Curator tour stops'}
      >
        {tour.weaponIds.map((wid, idx) => {
          const isCurrent = idx === currentIdx;
          const shortLabel = isWeaponId(wid)
            ? getLocalizedShortWeaponLabel(wid, lang)
            : wid;
          return (
            <button
              key={wid}
              type="button"
              className={`curator-stop-pill ${isCurrent ? 'is-active' : ''}`}
              data-testid={`curator-stop-${wid}`}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => navigateToStop(wid)}
            >
              <span className="curator-stop-num">{idx + 1}</span>
              <span>{shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="curator-trail-actions">
        <button
          type="button"
          className="curator-nav-btn"
          data-testid="curator-trail-prev"
          disabled={!canGoPrev}
          onClick={handlePrev}
          title={isZh ? '切换到上一站展品' : 'Previous exhibit in tour'}
        >
          <ChevronLeft size={13} aria-hidden="true" />
          <span>{isZh ? '上一站' : 'Prev'}</span>
        </button>

        <button
          type="button"
          className="curator-nav-btn"
          data-testid="curator-trail-next"
          disabled={!canGoNext}
          onClick={handleNext}
          title={isZh ? '切换到下一站展品' : 'Next exhibit in tour'}
        >
          <span>{isZh ? '下一站' : 'Next'}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="curator-exit-btn"
          data-testid="curator-trail-exit"
          onClick={handleExit}
          aria-label={isZh ? '退出 3D 策展导览' : 'Exit Curator Tour'}
          title={isZh ? '退出 3D 策展导览' : 'Exit Tour'}
        >
          <X size={13} aria-hidden="true" />
          <span className="curator-exit-label">
            {isZh ? '退出导览' : 'Exit Tour'}
          </span>
        </button>
      </div>
    </nav>
  );
};

CuratorTrailBar.displayName = 'CuratorTrailBar';

export default CuratorTrailBar;

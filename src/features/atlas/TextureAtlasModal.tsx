import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import {
  normalizeTextureFileName,
  resolveTextureUrl,
} from '../../engine/utils/assetUrl';
import {
  getLocalizedAtlasHeading,
  getLocalizedAtlasSuite,
} from '../../i18n/atlasStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest, WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import '../../styles/atlas-modal.css';

export interface TextureAtlasModalProps {
  forceOpen?: boolean;
}

export const TextureAtlasModal: React.FC<TextureAtlasModalProps> = ({
  forceOpen = false,
}) => {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const storeOpen = useAppStore((s) => s.textureModalOpen);
  const open = forceOpen || storeOpen;
  const setOpen = useAppStore((s) => s.setTextureModalOpen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const pbrEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbr = useAppStore((s) => s.togglePbrTextures);

  const [weaponTab, setWeaponTab] = useState<WeaponId>(activeWeaponId);
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open, setOpen]);

  const tabManifest = getWeaponManifest(weaponTab);
  const tabPlugin = useWeaponPlugin(weaponTab);
  const suites = tabPlugin?.pbrSuites ?? [];

  if (!open) return null;

  const atlasUi = UI_STRINGS[lang].atlasModal;
  const activeIndex = suites.findIndex((s) => s.id === activeSuiteId);
  const currentIdx = activeIndex >= 0 ? activeIndex : 0;
  const rawCurrent = suites[currentIdx];
  const current = rawCurrent
    ? getLocalizedAtlasSuite(weaponTab, rawCurrent, lang, currentIdx)
    : null;
  const tabShortLabel = getLocalizedShortWeaponLabel(weaponTab, lang);

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="tex-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tex-modal-header">
          <div className="tex-modal-title-wrap">
            <div className="tex-badge-row">
              <span className="tex-modal-badge">
                <ImageIcon size={12} />
                {atlasUi.kicker}
              </span>
              <div
                className="tex-weapon-switcher"
                role="tablist"
                aria-label={atlasUi.weaponSwitcherAria}
              >
                {WEAPON_MANIFESTS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`tex-weapon-pill ${
                      weaponTab === m.id ? 'active' : ''
                    }`}
                    onMouseEnter={() => preloadWeaponPlugin(m.id)}
                    onClick={() => {
                      setWeaponTab(m.id);
                      setActiveSuiteId('');
                    }}
                  >
                    {m.catalog.bayCode.replace('BAY-', '#')}{' '}
                    {getLocalizedShortWeaponLabel(m.id, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 id={titleId} className="tex-modal-title">
                {getLocalizedAtlasHeading(
                  weaponTab,
                  lang,
                  tabManifest.atlasHeadingCn
                )}
              </h2>
              <p className="tex-modal-sub">{atlasUi.subtitle}</p>
            </div>
          </div>

          <div className="tex-modal-header-actions">
            <button
              type="button"
              className={`tex-live-toggle ${pbrEnabled ? 'is-on' : ''}`}
              onClick={togglePbr}
            >
              {pbrEnabled ? <Check size={14} /> : <Layers size={14} />}
              <span>{pbrEnabled ? atlasUi.liveOn : atlasUi.liveOff}</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="tex-close-btn"
              onClick={() => setOpen(false)}
              aria-label={atlasUi.closeAria}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {current ? (
          <>
            {/* Suite Selector Tabs */}
            <div
              className="tex-suite-tabs"
              style={{
                gridTemplateColumns: `repeat(${suites.length}, minmax(0, 1fr))`,
              }}
            >
              {suites.map((s, idx) => {
                const locTab = getLocalizedAtlasSuite(weaponTab, s, lang, idx);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`tex-suite-tab ${
                      s.id === current.id ? 'active' : ''
                    }`}
                    onClick={() => setActiveSuiteId(s.id)}
                  >
                    <span className="tex-tab-tag">{locTab.partTag}</span>
                    <span className="tex-tab-name">{locTab.tabTitle}</span>
                  </button>
                );
              })}
            </div>

            {/* Suite Metadata Banner */}
            <div className="tex-suite-info">
              <div className="tex-info-main">
                <div className="tex-info-headline">
                  <h3>{current.title}</h3>
                  <span className="tex-res-pill">{current.resolution}</span>
                </div>
                <p>{current.summary}</p>
              </div>
              <div className="tex-info-chips">
                {current.highlights.map((h) => (
                  <span key={h} className="tex-highlight-chip">
                    <Sparkles size={11} />
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* 3-Channel Preview Grid */}
            <div className="tex-channels-grid">
              {current.channels.map((ch) => {
                const cleanFile = normalizeTextureFileName(ch.fileName);
                const resolvedUrl = resolveTextureUrl(cleanFile);
                return (
                  <div
                    key={`${current.id}-${cleanFile}`}
                    className="tex-channel-card"
                  >
                    <div className="tex-ch-head">
                      <div className="tex-ch-meta">
                        <span
                          className={`tex-ch-badge kind-${ch.kind.toLowerCase()}`}
                        >
                          {ch.kind === 'Roughness'
                            ? atlasUi.ormBadge
                            : ch.kind.toUpperCase()}
                        </span>
                        <span
                          className="tex-ch-title"
                          title={
                            ch.kind === 'Roughness'
                              ? atlasUi.ormChannelTitle
                              : ch.label
                          }
                        >
                          {ch.kind === 'Roughness'
                            ? atlasUi.ormChannelTitle
                            : ch.label}
                        </span>
                      </div>
                      <a
                        href={resolvedUrl}
                        download={cleanFile}
                        className="tex-download-link"
                        title={atlasUi.downloadTitle(cleanFile)}
                      >
                        <Download size={12} />
                        <span>WEBP</span>
                      </a>
                    </div>

                    <div className="tex-img-frame">
                      <img src={resolvedUrl} alt={ch.label} loading="lazy" />
                    </div>

                    <div className="tex-ch-foot">
                      <code>/textures/{cleanFile}</code>
                      <span>{ch.note}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="tex-suite-info">
            <p>{atlasUi.loadingFallback(tabShortLabel)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextureAtlasModal;
